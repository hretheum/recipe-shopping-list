import { App, Modal, Notice, Setting } from 'obsidian';
import { ShoppingList, ShoppingListAdapter } from './ShoppingListAdapter';

/** Co użytkownik wybrał w modalu: istniejącą listę albo nową do założenia. */
export type ListChoice =
	| { kind: 'existing'; uuid: string; name: string }
	| { kind: 'new'; name: string };

/**
 * Zamienia wybór z modalu na konkretną listę. Nowa powstaje dopiero tutaj,
 * czyli po zatwierdzeniu — samo otwarcie modalu niczego w Bring nie zakłada.
 */
export async function resolveChoice(
	choice: ListChoice,
	adapter: Pick<ShoppingListAdapter, 'createList'>,
): Promise<ShoppingList> {
	if (choice.kind === 'existing') {
		return { uuid: choice.uuid, name: choice.name };
	}
	const name = choice.name.trim();
	if (name === '') {
		throw new Error('Podaj nazwę nowej listy zakupów.');
	}
	return adapter.createList(name);
}

/**
 * Domyślna nazwa nowej listy: tytuł przepisu. Przy kilku przepisach naraz
 * bierzemy tytuł pierwszego i dopisujemy licznik pozostałych — sklejenie
 * wszystkich dałoby nazwę nie do odczytania na ekranie telefonu.
 */
export function defaultListName(recipeTitles: string[]): string {
	const first = recipeTitles[0];
	if (first === undefined) {
		return 'Zakupy';
	}
	const rest = recipeTitles.length - 1;
	return rest === 0 ? first : `${first} +${rest}`;
}

/** Wartość w rozwijanej liście oznaczająca „załóż nową". */
const NEW_LIST = '__new__';

/*
 * Wybór listy docelowej. Modal dostaje gotowe listy z konta — logowanie
 * i ich pobranie dzieje się przed normalizacją LLM, więc złe hasło albo
 * brak sieci wychodzi zanim model przemieli składniki.
 */
export class ListSelectionModal extends Modal {
	private mode: string = NEW_LIST;
	private newListName: string;
	private submitted = false;

	constructor(
		app: App,
		private readonly lists: ShoppingList[],
		suggestedName: string,
		private readonly onSubmit: (choice: ListChoice) => void,
		private readonly onCancel: () => void,
	) {
		super(app);
		this.newListName = suggestedName;
	}

	onOpen(): void {
		this.setTitle('Wybierz listę zakupów w Bring!');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) {
			this.onCancel(); // zamknięcie bez wyboru musi odblokować komendę
		}
	}

	private currentChoice(): ListChoice {
		if (this.mode === NEW_LIST) {
			return { kind: 'new', name: this.newListName };
		}
		const picked = this.lists.find((list) => list.uuid === this.mode);
		return picked === undefined
			? { kind: 'new', name: this.newListName }
			: { kind: 'existing', uuid: picked.uuid, name: picked.name };
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl)
			.setName('Lista docelowa')
			.setDesc(
				this.lists.length === 0
					? 'Na koncie nie ma jeszcze żadnej listy — założymy nową.'
					: 'Domyślnie zakładamy nową listę o nazwie przepisu.',
			)
			.addDropdown((dropdown) => {
				dropdown.addOption(NEW_LIST, 'Nowa lista');
				for (const list of this.lists) {
					dropdown.addOption(list.uuid, list.name);
				}
				dropdown.setValue(this.mode);
				dropdown.onChange((value) => {
					this.mode = value;
					this.render();
				});
			});

		if (this.mode === NEW_LIST) {
			new Setting(contentEl).setName('Nazwa nowej listy').addText((text) =>
				text.setValue(this.newListName).onChange((value) => {
					this.newListName = value;
				}),
			);
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('Wyślij do listy zakupów')
				.setCta()
				.onClick(() => {
					const choice = this.currentChoice();
					if (choice.kind === 'new' && choice.name.trim() === '') {
						new Notice('Podaj nazwę nowej listy zakupów.');
						return;
					}
					this.submitted = true;
					this.close();
					this.onSubmit(choice);
				}),
		);
	}
}
