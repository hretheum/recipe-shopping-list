import { App, Modal, Notice, Setting } from 'obsidian';
import { ShoppingList, ShoppingListAdapter } from './ShoppingListAdapter';

/** What the user chose in the modal: an existing list or a new one to create. */
export type ListChoice =
	| { kind: 'existing'; uuid: string; name: string }
	| { kind: 'new'; name: string };

/**
 * Turns the modal's choice into a concrete list. A new list is only created
 * here, after confirmation: opening the modal creates nothing in Bring!.
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
		throw new Error('Enter a name for the new shopping list.');
	}
	return adapter.createList(name);
}

/**
 * Default name of a new list: the recipe title. With several recipes we take
 * the first title plus a counter of the rest: joining them all would give a
 * name that cannot be read on a phone screen.
 */
export function defaultListName(recipeTitles: string[]): string {
	const first = recipeTitles[0];
	if (first === undefined) {
		return 'Shopping';
	}
	const rest = recipeTitles.length - 1;
	return rest === 0 ? first : `${first} +${rest}`;
}

/** Dropdown value meaning "create a new list". */
const NEW_LIST = '__new__';

/*
 * Choosing the target list. The modal gets the account's lists ready-made:
 * logging in and fetching them happens before LLM normalization, so a wrong
 * password or no network surfaces before the model chews through ingredients.
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
		this.setTitle('Choose the Bring! shopping list');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) {
			this.onCancel(); // closing without a choice must unlock the command
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
			.setName('Target list')
			.setDesc(
				this.lists.length === 0
					? 'The account has no lists yet, so a new one will be created.'
					: 'By default a new list named after the recipe is created.',
			)
			.addDropdown((dropdown) => {
				dropdown.addOption(NEW_LIST, 'New list');
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
			new Setting(contentEl).setName('New list name').addText((text) =>
				text.setValue(this.newListName).onChange((value) => {
					this.newListName = value;
				}),
			);
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('Send to shopping list')
				.setCta()
				.onClick(() => {
					const choice = this.currentChoice();
					if (choice.kind === 'new' && choice.name.trim() === '') {
						new Notice('Enter a name for the new shopping list.');
						return;
					}
					this.submitted = true;
					this.close();
					this.onSubmit(choice);
				}),
		);
	}
}
