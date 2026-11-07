import { RawIngredientRow } from './types';

/*
 * Pure functions on strings (no 'obsidian' import), testable outside the plugin.
 *
 * Supported shapes under the ingredients heading:
 * - a Markdown table; the ingredient text is taken from the configured column
 *   (1-based, falls back to the last column when a row is shorter),
 * - a bullet or checkbox list ("- 200 g flour", "- [ ] 2 eggs").
 *
 * Real-world clipper output is messy: rows may be prefixed with "* ", the last
 * table row may lack the closing "|", sub-section labels end with a colon, and
 * instruction sentences can leak into the table. Labels are skipped here; the
 * final ingredient/not-ingredient decision is made by the LLM.
 */

const NEXT_HEADING_RE = /^#{1,6}\s/;
const SEPARATOR_ROW_RE = /^[\s|:-]+$/;
const LIST_ITEM_RE = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseIngredientRows(
	markdown: string,
	recipeName: string,
	heading = 'Ingredients',
	column = 2,
): RawIngredientRow[] {
	const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading.trim())}\\s*$`, 'i');
	const lines = markdown.split('\n');
	const start = lines.findIndex((line) => headingRe.test(line.trim()));
	if (start === -1) {
		return [];
	}

	const rows: RawIngredientRow[] = [];
	let headerSkipped = false;

	for (let i = start + 1; i < lines.length; i++) {
		const line = (lines[i] ?? '').trim();
		if (NEXT_HEADING_RE.test(line)) {
			break;
		}
		let text: string | null = null;
		if (line.startsWith('|')) {
			if (SEPARATOR_ROW_RE.test(line)) {
				continue;
			}
			if (!headerSkipped) {
				headerSkipped = true; // the first table row is the column header
				continue;
			}
			text = extractCell(line, column);
		} else {
			const item = LIST_ITEM_RE.exec(line);
			text = item === null ? null : (item[1] ?? '');
		}
		if (text === null) {
			continue;
		}
		const cleaned = cleanCell(text);
		if (cleaned === '' || isSectionLabel(cleaned)) {
			continue;
		}
		rows.push({ text: cleaned, recipe: recipeName });
	}

	return rows;
}

/** The chosen column of a table row; tolerates a missing closing "|". */
function extractCell(row: string, column: number): string | null {
	const cells = row.split('|').slice(1);
	if (cells.length > 0 && (cells[cells.length - 1] ?? '').trim() === '') {
		cells.pop();
	}
	if (cells.length === 0) {
		return null;
	}
	const index = Math.min(Math.max(column, 1), cells.length) - 1;
	return cells[index] ?? null;
}

function cleanCell(cell: string): string {
	return cell
		.trim()
		.replace(/^[*-]\s+/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** A sub-section label ("Herb butter:") is not an ingredient. */
function isSectionLabel(text: string): boolean {
	return text.endsWith(':');
}
