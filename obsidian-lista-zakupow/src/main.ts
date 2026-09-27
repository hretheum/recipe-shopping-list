import { App, Modal, Notice, Plugin, TFile, requestUrl } from 'obsidian';
import { BringAdapter } from './BringAdapter';
import { DictionaryStore } from './DictionaryStore';
import { FileSelectionModal } from './FileSelectionModal';
import { parseIngredientRows } from './IngredientParser';
import { defaultListName, ListChoice, ListSelectionModal, resolveChoice } from './ListSelectionModal';
import { createChatFn } from './LlmClient';
import { Normalizer } from './Normalizer';
import { SettingsTab } from './SettingsTab';
import { HttpFn, PushResult, ShoppingList } from './ShoppingListAdapter';
import { aggregate, formatItemName, formatSpecification } from './Summer';
import { AggregatedItem, DEFAULT_SETTINGS, ListaZakupowSettings, RawIngredientRow } from './types';

export default class ListaZakupowPlugin extends Plugin {
	settings!: ListaZakupowSettings;
	private running = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addCommand({
			id: 'dodaj-skladniki-do-listy-zakupow',
			name: 'Dodaj składniki z przepisów do listy zakupów',
			callback: () => this.openSelection(),
		});
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ListaZakupowSettings> | null,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private openSelection(): void {
		if (this.running) {
			new Notice('Poprzednie wysyłanie jeszcze trwa.');
			return;
		}
		if (this.settings.bringEmail === '' || this.settings.bringPassword === '') {
			new Notice('Uzupełnij dane logowania Bring! w ustawieniach wtyczki.');
			return;
		}
		const active = this.app.workspace.getActiveFile();
		new FileSelectionModal(this.app, active, (files) => {
			void this.chooseList(files);
		}).open();
	}

	/*
	 * Logowanie i pobranie list dzieje się tutaj, przed pipeline'em: złe hasło
	 * albo brak sieci ma wyjść zanim LLM przemieli składniki. Adapter przechodzi
	 * dalej, żeby kolejne żądania korzystały z tej samej sesji.
	 */
	private async chooseList(files: TFile[]): Promise<void> {
		this.running = true;
		const progress = new Notice('Lista zakupów: pobieram listy z Bring!…', 0);
		const adapter = new BringAdapter(
			{ email: this.settings.bringEmail, password: this.settings.bringPassword },
			obsidianHttp,
		);

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
				void this.runPipeline(files, adapter, choice);
			},
			() => {
				this.running = false; // modal zamknięty bez wyboru
			},
		).open();
	}

	private async runPipeline(files: TFile[], adapter: BringAdapter, choice: ListChoice): Promise<void> {
		const progress = new Notice('Lista zakupów: czytam przepisy…', 0);
		try {
			const rows: RawIngredientRow[] = [];
			for (const file of files) {
				const content = await this.app.vault.cachedRead(file);
				rows.push(...parseIngredientRows(content, file.basename));
			}
			if (rows.length === 0) {
				throw new Error('W wybranych notatkach nie znalazłem tabeli "## Ingredients" z wierszami składników.');
			}

			const store = new DictionaryStore(this.app, this.settings.dictionaryPath);
			const dictionary = await store.load();

			progress.setMessage(`Lista zakupów: normalizuję ${rows.length} wierszy (LLM: ${this.settings.llmModel})…`);
			const normalizer = new Normalizer(createChatFn(this.settings));
			const normalized = await normalizer.normalize(rows, dictionary);
			if (normalized.items.length === 0) {
				throw new Error('LLM nie rozpoznał żadnego składnika w wybranych notatkach.');
			}

			const aggregated = aggregate(normalized.items, dictionary);

			// Nowa lista powstaje dopiero teraz — nieudana normalizacja nie zostawia pustej listy w Bring.
			const list = await resolveChoice(choice, adapter);

			progress.setMessage(`Lista zakupów: wysyłam ${aggregated.length} pozycji na „${list.name}"…`);
			const results = await adapter.pushItems(list.uuid, aggregated);

			const appended = await store.appendSuggestions(normalized.suggestions, dictionary);

			progress.hide();
			new SummaryModal(this.app, files, list, results, appended, this.settings.dictionaryPath).open();
		} catch (error) {
			this.fail(progress, error);
		} finally {
			this.running = false;
		}
	}

	private fail(progress: Notice, error: unknown): void {
		progress.hide();
		const message = error instanceof Error ? error.message : String(error);
		new Notice(`Lista zakupów: błąd — ${message}`, 10000);
		console.error('[lista-zakupow]', error);
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
		this.setTitle(`Wysłano do Bring!: „${this.list.name}"`);
		const { contentEl } = this;

		const ok = this.results.filter((r) => r.ok);
		const failed = this.results.filter((r) => !r.ok);

		contentEl.createEl('p', {
			text: `Przepisy: ${this.files.map((f) => f.basename).join(', ')}.`,
		});

		if (ok.length > 0) {
			contentEl.createEl('p', { text: `Dodane pozycje (${ok.length}):` });
			const list = contentEl.createEl('ul');
			for (const result of ok) {
				list.createEl('li', { text: formatLine(result.item) });
			}
		}

		if (failed.length > 0) {
			contentEl.createEl('p', { text: `Błędy (${failed.length}):` });
			const list = contentEl.createEl('ul');
			for (const result of failed) {
				list.createEl('li', { text: `${formatItemName(result.item)} — ${result.error ?? 'nieznany błąd'}` });
			}
		}

		if (this.appendedSuggestions > 0) {
			contentEl.createEl('p', {
				text: `Dopisano ${this.appendedSuggestions} propozycji do słownika (${this.dictionaryPath}) — zweryfikuj je przy okazji.`,
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

function formatLine(item: AggregatedItem): string {
	const spec = formatSpecification(item);
	return spec === '' ? formatItemName(item) : `${formatItemName(item)} — ${spec}`;
}

/** Most requestUrl → HttpFn adaptera (getter .json rzuca przy pustym body, np. 204). */
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
