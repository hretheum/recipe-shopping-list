import { App, FuzzySuggestModal, Modal, Setting, TFile } from 'obsidian';

/*
 * Wybór 1-2 (lub więcej) notatek przepisów bez opuszczania Obsidiana.
 * FileSelectionModal pokazuje bieżący wybór i przyciski; RecipeSuggestModal
 * (FuzzySuggestModal — fuzzy-search za darmo, decyzja D3) służy do
 * dokładania kolejnych notatek. Za "przepis" uznajemy notatkę
 * z frontmatterem type: recipe (odczyt przez MetadataCache — bez dysku).
 */

export function isRecipeNote(app: App, file: TFile): boolean {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	return frontmatter?.type === 'recipe';
}

class RecipeSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly exclude: Set<string>,
		private readonly onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder('Wybierz notatkę przepisu…');
	}

	getItems(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => isRecipeNote(this.app, file) && !this.exclude.has(file.path))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class FileSelectionModal extends Modal {
	private readonly selected: TFile[] = [];

	constructor(
		app: App,
		initialFile: TFile | null,
		private readonly onSubmit: (files: TFile[]) => void,
	) {
		super(app);
		if (initialFile !== null && isRecipeNote(app, initialFile)) {
			this.selected.push(initialFile);
		}
	}

	onOpen(): void {
		this.setTitle('Dodaj składniki do listy zakupów');
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
					? 'Wybierz notatki przepisów (frontmatter type: recipe), z których zebrać składniki.'
					: 'Wybrane przepisy:',
		});

		for (const file of this.selected) {
			new Setting(contentEl).setName(file.basename).addExtraButton((button) =>
				button
					.setIcon('x')
					.setTooltip('Usuń z wyboru')
					.onClick(() => {
						this.selected.remove(file);
						this.render();
					}),
			);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Dodaj przepis…').onClick(() => {
					const exclude = new Set(this.selected.map((file) => file.path));
					new RecipeSuggestModal(this.app, exclude, (file) => {
						this.selected.push(file);
						this.render();
					}).open();
				}),
			)
			.addButton((button) => {
				button
					.setButtonText(`Wyślij do listy zakupów (${this.selected.length})`)
					.setCta()
					.onClick(() => {
						if (this.selected.length === 0) {
							return;
						}
						this.close();
						this.onSubmit([...this.selected]);
					});
				button.setDisabled(this.selected.length === 0);
				return button;
			});
	}
}
