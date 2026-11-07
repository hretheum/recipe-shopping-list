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

		contentEl.addClass('rsl-preview');
		for (const row of this.rows) {
			const line = contentEl.createDiv({ cls: 'rsl-row' });
			const check = line.createEl('input', { type: 'checkbox', cls: 'rsl-include' });
			check.checked = row.include;
			check.addEventListener('change', () => (row.include = check.checked));
			const bind = (cls: string, placeholder: string, key: 'name' | 'quantity' | 'unit') => {
				const input = line.createEl('input', { type: 'text', cls, placeholder });
				input.value = row[key];
				input.addEventListener('input', () => (row[key] = input.value));
			};
			bind('rsl-name', 'name', 'name');
			bind('rsl-qty', 'qty', 'quantity');
			bind('rsl-unit', 'unit', 'unit');
			line.createDiv({ cls: 'rsl-source', text: row.source.sourceRecipes.join(', ') });
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
