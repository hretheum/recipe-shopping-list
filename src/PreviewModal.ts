import { App, Modal, Setting } from 'obsidian';
import { AggregatedItem } from './types';

/** Parses a quantity typed by the user; empty or invalid text means "no quantity". */
export function parseQuantity(text: string): number | null {
	const value = Number(text.trim().replace(',', '.'));
	return text.trim() !== '' && isFinite(value) && value >= 0 ? value : null;
}

interface Row {
	include: boolean;
	name: string;
	quantity: string;
	unit: string;
	source: AggregatedItem;
}

/*
 * Preview of the summed list before anything is sent: untick items you do not
 * need (you already have them at home) and fix a name, quantity or unit.
 * Closing the modal without confirming sends nothing and creates no list.
 */
export class PreviewModal extends Modal {
	private readonly rows: Row[];
	private confirmed = false;

	constructor(
		app: App,
		items: AggregatedItem[],
		private readonly onConfirm: (items: AggregatedItem[]) => void,
		private readonly onCancel: () => void,
	) {
		super(app);
		this.rows = items.map((item) => ({
			include: true,
			name: item.ingredient,
			quantity: item.quantity === null ? '' : String(item.quantity),
			unit: item.unit ?? '',
			source: item,
		}));
	}

	onOpen(): void {
		this.setTitle('Review the shopping list');
		const { contentEl } = this;
		contentEl.createEl('p', { text: 'Untick what you do not need and edit names, quantities or units. Nothing is sent until you confirm.' });

		for (const row of this.rows) {
			new Setting(contentEl)
				.setDesc(row.source.sourceRecipes.join(', '))
				.addToggle((toggle) => toggle.setValue(row.include).onChange((value) => (row.include = value)))
				.addText((text) => text.setValue(row.name).onChange((value) => (row.name = value)))
				.addText((text) => text.setPlaceholder('qty').setValue(row.quantity).onChange((value) => (row.quantity = value)))
				.addText((text) => text.setPlaceholder('unit').setValue(row.unit).onChange((value) => (row.unit = value)));
		}

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('Send to shopping list')
				.setCta()
				.onClick(() => {
					this.confirmed = true;
					this.close();
					this.onConfirm(this.result());
				}),
		);
	}

	/** The confirmed items, with the user's edits applied. */
	result(): AggregatedItem[] {
		return this.rows
			.filter((row) => row.include && row.name.trim() !== '')
			.map((row) => ({
				...row.source,
				ingredient: row.name.trim(),
				quantity: parseQuantity(row.quantity),
				unit: row.unit.trim() === '' ? null : row.unit.trim(),
			}));
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.confirmed) {
			this.onCancel();
		}
	}
}
