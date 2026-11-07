import { App, FuzzySuggestModal, Modal, Setting, TFile } from 'obsidian';
import { RecipeShoppingListSettings } from './types';

/*
 * Choosing recipe notes without leaving Obsidian. FileSelectionModal shows the
 * current selection and the buttons; RecipeSuggestModal (a FuzzySuggestModal,
 * so fuzzy search comes for free) adds further notes. A note counts as a recipe
 * when its frontmatter property matches the configured value (default
 * `type: recipe`), read through the metadata cache, without touching the disk.
 */

type FrontmatterSettings = Pick<RecipeShoppingListSettings, 'recipeProperty' | 'recipeValue' | 'sentProperty'>;

export function isRecipeNote(app: App, file: TFile, settings: FrontmatterSettings): boolean {
	if (settings.recipeProperty.trim() === '') {
		return true;
	}
	const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[settings.recipeProperty.trim()];
	const wanted = settings.recipeValue.trim();
	if (wanted === '') {
		return value !== undefined;
	}
	return Array.isArray(value) ? value.map(String).includes(wanted) : String(value) === wanted;
}

/** The date this note's ingredients were last sent, or null. */
export function sentDate(app: App, file: TFile, settings: FrontmatterSettings): string | null {
	const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[settings.sentProperty];
	return value === undefined || value === null || value === '' ? null : String(value);
}

/** Recipes sorted with unsent first, then newest first. */
function recipeFiles(app: App, settings: FrontmatterSettings, exclude: Set<string>): TFile[] {
	return app.vault
		.getMarkdownFiles()
		.filter((file) => isRecipeNote(app, file, settings) && !exclude.has(file.path))
		.sort((a, b) => {
			const unsent = Number(sentDate(app, a, settings) !== null) - Number(sentDate(app, b, settings) !== null);
			return unsent !== 0 ? unsent : b.stat.mtime - a.stat.mtime;
		});
}

class RecipeSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly settings: FrontmatterSettings,
		private readonly exclude: Set<string>,
		private readonly onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder('Choose a recipe note…');
	}

	getItems(): TFile[] {
		return recipeFiles(this.app, this.settings, this.exclude);
	}

	getItemText(file: TFile): string {
		const sent = sentDate(this.app, file, this.settings);
		return sent === null ? file.basename : `${file.basename} (sent ${sent})`;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class FileSelectionModal extends Modal {
	private readonly selected: TFile[] = [];
	private multiplier = '1';

	constructor(
		app: App,
		initialFile: TFile | null,
		private readonly settings: RecipeShoppingListSettings,
		private readonly onSubmit: (files: TFile[], multiplier: number) => void,
	) {
		super(app);
		if (initialFile !== null && isRecipeNote(app, initialFile, settings)) {
			this.selected.push(initialFile);
		}
	}

	onOpen(): void {
		this.setTitle('Add ingredients to shopping list');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('p', {
			text:
				this.selected.length === 0
					? `Choose the recipe notes (${this.settings.recipeProperty}: ${this.settings.recipeValue}) to collect ingredients from.`
					: 'Selected recipes:',
		});

		for (const file of this.selected) {
			const sent = sentDate(this.app, file, this.settings);
			const row = new Setting(contentEl).setName(file.basename);
			if (sent !== null) {
				row.setDesc(`Already sent on ${sent}.`);
			}
			row.addExtraButton((button) =>
				button
					.setIcon('x')
					.setTooltip('Remove from selection')
					.onClick(() => {
						this.selected.remove(file);
						this.render();
					}),
			);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Add recipe…').onClick(() => {
					const exclude = new Set(this.selected.map((file) => file.path));
					new RecipeSuggestModal(this.app, this.settings, exclude, (file) => {
						this.selected.push(file);
						this.render();
					}).open();
				}),
			)
			.addButton((button) =>
				button.setButtonText('Add newest unsent').onClick(() => {
					const exclude = new Set(this.selected.map((file) => file.path));
					const next = recipeFiles(this.app, this.settings, exclude)[0];
					if (next !== undefined) {
						this.selected.push(next);
						this.render();
					}
				}),
			);

		new Setting(contentEl)
			.setName('Servings multiplier')
			.setDesc('Scales every quantity, e.g. 2 to cook everything twice.')
			.addText((text) =>
				text.setValue(this.multiplier).onChange((value) => {
					this.multiplier = value;
				}),
			);

		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText(`Continue (${this.selected.length})`)
				.setCta()
				.onClick(() => {
					if (this.selected.length === 0) {
						return;
					}
					const factor = Number(this.multiplier.replace(',', '.'));
					this.close();
					this.onSubmit([...this.selected], factor > 0 && isFinite(factor) ? factor : 1);
				});
			button.setDisabled(this.selected.length === 0);
			return button;
		});
	}
}
