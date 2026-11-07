import { App, Modal, Notice, Plugin, TFile, requestUrl } from 'obsidian';
import { BringAdapter } from './BringAdapter';
import { DictionaryStore } from './DictionaryStore';
import { FileSelectionModal } from './FileSelectionModal';
import { parseIngredientRows } from './IngredientParser';
import { defaultListName, ListChoice, ListSelectionModal, resolveChoice } from './ListSelectionModal';
import { createChatFn } from './LlmClient';
import { Normalizer } from './Normalizer';
import { PreviewModal } from './PreviewModal';
import { SettingsTab } from './SettingsTab';
import { migratePlaintextSecrets, readSecret } from './Secrets';
import { HttpFn, PushResult, ShoppingList } from './ShoppingListAdapter';
import { aggregate, formatItemName, formatSpecification, scaleItems } from './Summer';
import { AggregatedItem, DEFAULT_SETTINGS, RawIngredientRow, RecipeShoppingListSettings } from './types';

export default class RecipeShoppingListPlugin extends Plugin {
	settings!: RecipeShoppingListSettings;
	private running = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addCommand({
			id: 'add-recipe-ingredients',
			name: 'Add ingredients from recipes to shopping list',
			callback: () => this.openSelection(),
		});
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		// Early versions kept passwords as plain text in data.json (inside the vault).
		// Move them into the secret storage and clean data.json.
		const migrated = migratePlaintextSecrets(this.app.secretStorage, data);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<RecipeShoppingListSettings>);
		if (migrated) {
			await this.saveData(this.settings);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private bringPassword(): string {
		return readSecret(this.app.secretStorage, this.settings.bringPasswordSecret);
	}

	private openSelection(): void {
		if (this.running) {
			new Notice('The previous send is still running.');
			return;
		}
		if (this.settings.bringEmail === '' || this.bringPassword() === '') {
			new Notice('Set your Bring! email and password in the plugin settings first.');
			return;
		}
		if (this.settings.llmModel === '') {
			new Notice('Choose an LLM model in the plugin settings first.');
			return;
		}
		const active = this.app.workspace.getActiveFile();
		new FileSelectionModal(this.app, active, this.settings, (files, multiplier) => {
			void this.chooseList(files, multiplier);
		}).open();
	}

	/*
	 * Logging in and fetching the lists happens here, before the pipeline: a
	 * wrong password or no network should surface before the LLM chews through
	 * the ingredients. The adapter is passed on so later requests share the session.
	 */
	private async chooseList(files: TFile[], multiplier: number): Promise<void> {
		this.running = true;
		const progress = new Notice('Shopping list: fetching your Bring! lists…', 0);
		const adapter = new BringAdapter({ email: this.settings.bringEmail, password: this.bringPassword() }, obsidianHttp);

		let lists: ShoppingList[];
		try {
			lists = await adapter.fetchLists();
		} catch (error) {
			this.fail(progress, error);
			return;
		}
		progress.hide();

		new ListSelectionModal(
			this.app,
			lists,
			defaultListName(files.map((file) => file.basename)),
			(choice) => {
				void this.runPipeline(files, adapter, choice, multiplier);
			},
			() => {
				this.running = false; // modal closed without a choice
			},
		).open();
	}

	private async runPipeline(files: TFile[], adapter: BringAdapter, choice: ListChoice, multiplier: number): Promise<void> {
		const progress = new Notice('Shopping list: reading recipes…', 0);
		try {
			const rows: RawIngredientRow[] = [];
			for (const file of files) {
				const content = await this.app.vault.cachedRead(file);
				rows.push(...parseIngredientRows(content, file.basename, this.settings.ingredientsHeading, this.settings.ingredientColumn));
			}
			if (rows.length === 0) {
				throw new Error(`No ingredient rows found under the "${this.settings.ingredientsHeading}" heading in the selected notes.`);
			}

			const store = new DictionaryStore(this.app, this.settings.dictionaryPath);
			const dictionary = await store.load();

			progress.setMessage(`Shopping list: normalizing ${rows.length} rows (LLM: ${this.settings.llmModel})…`);
			const apiKey = readSecret(this.app.secretStorage, this.settings.llmApiKeySecret);
			const normalizer = new Normalizer(createChatFn(this.settings, apiKey));
			const normalized = await normalizer.normalize(rows, dictionary);
			if (normalized.items.length === 0) {
				throw new Error('The LLM did not recognize any ingredient in the selected notes.');
			}

			const aggregated = aggregate(scaleItems(normalized.items, multiplier), dictionary);
			progress.hide();

			const reviewed = await this.review(aggregated);
			if (reviewed === null) {
				return; // cancelled in the preview: nothing was sent or created
			}
			if (reviewed.length === 0) {
				new Notice('Nothing selected to send.');
				return;
			}

			// The new list is created only now: a failed normalization or a cancelled
			// preview leaves no empty list in Bring!.
			const list = await resolveChoice(choice, adapter);
			const sending = new Notice(`Shopping list: sending ${reviewed.length} items to "${list.name}"…`, 0);
			const results = await adapter.pushItems(list.uuid, reviewed);
			sending.hide();

			const appended = await store.appendSuggestions(normalized.suggestions, dictionary);
			if (this.settings.markSent) {
				await this.markSent(files, results);
			}

			new SummaryModal(this.app, files, list, results, appended, this.settings.dictionaryPath).open();
		} catch (error) {
			this.fail(progress, error);
		} finally {
			this.running = false;
		}
	}

	/** Shows the preview modal; resolves to the confirmed items or null when cancelled. */
	private review(items: AggregatedItem[]): Promise<AggregatedItem[] | null> {
		return new Promise((resolve) => {
			new PreviewModal(
				this.app,
				items,
				(confirmed) => resolve(confirmed),
				() => resolve(null),
			).open();
		});
	}

	/** Writes today's date into the sent property of every recipe that contributed a sent item. */
	private async markSent(files: TFile[], results: PushResult[]): Promise<void> {
		const sentRecipes = new Set(results.filter((r) => r.ok).flatMap((r) => r.item.sourceRecipes));
		const today = new Date();
		const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		for (const file of files) {
			if (!sentRecipes.has(file.basename)) {
				continue;
			}
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				frontmatter[this.settings.sentProperty] = stamp;
			});
		}
	}

	private fail(progress: Notice, error: unknown): void {
		progress.hide();
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Shopping list: error: ${message}`, 10000);
		console.error('[recipe-shopping-list]', error);
		this.running = false;
	}
}

class SummaryModal extends Modal {
	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly list: ShoppingList,
		private readonly results: PushResult[],
		private readonly appendedSuggestions: number,
		private readonly dictionaryPath: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(`Sent to Bring!: "${this.list.name}"`);
		const { contentEl } = this;

		const ok = this.results.filter((r) => r.ok);
		const failed = this.results.filter((r) => !r.ok);

		contentEl.createEl('p', {
			text: `Recipes: ${this.files.map((f) => f.basename).join(', ')}.`,
		});

		if (ok.length > 0) {
			contentEl.createEl('p', { text: `Added items (${ok.length}):` });
			const list = contentEl.createEl('ul');
			for (const result of ok) {
				list.createEl('li', { text: formatLine(result.item) });
			}
		}

		if (failed.length > 0) {
			contentEl.createEl('p', { text: `Errors (${failed.length}):` });
			const list = contentEl.createEl('ul');
			for (const result of failed) {
				list.createEl('li', { text: `${formatItemName(result.item)}: ${result.error ?? 'unknown error'}` });
			}
		}

		if (this.appendedSuggestions > 0) {
			contentEl.createEl('p', {
				text: `Added ${this.appendedSuggestions} proposals to the dictionary (${this.dictionaryPath}). Review them when you can.`,
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function formatLine(item: AggregatedItem): string {
	const spec = formatSpecification(item);
	return spec === '' ? formatItemName(item) : `${formatItemName(item)}: ${spec}`;
}

/** requestUrl → HttpFn bridge for the adapter (the .json getter throws on an empty body, e.g. 204). */
const obsidianHttp: HttpFn = async (request) => {
	const response = await requestUrl({
		url: request.url,
		method: request.method,
		headers: request.headers,
		...(request.contentType !== undefined ? { contentType: request.contentType } : {}),
		...(request.body !== undefined ? { body: request.body } : {}),
		throw: false,
	});
	let json: unknown = null;
	try {
		json = response.json;
	} catch {
		json = null;
	}
	return { status: response.status, text: response.text, json };
};
