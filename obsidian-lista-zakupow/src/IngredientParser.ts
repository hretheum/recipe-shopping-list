import { RawIngredientRow } from './types';

/*
 * Moduł celowo bez importu z 'obsidian' — czyste funkcje na stringach,
 * testowalne poza środowiskiem wtyczki.
 *
 * Format wejściowy (Obsidian Web Clipper) na podstawie realnych plików:
 * - sekcja "## Ingredients" z tabelą | Original | PL + SI |
 * - wiersze bywają prefiksowane "* " albo nie
 * - wiersze-etykiety podsekcji kończą się dwukropkiem ("Masło ziołowe:")
 * - w tabeli bywają wmieszane zdania instrukcji i notki o temperaturze —
 *   ich ostateczną klasyfikację robi LLM (Normalizer), nie parser
 * - ostatni wiersz tabeli bywa bez zamykającego "|"
 */

const HEADING_RE = /^##\s+Ingredients\s*$/i;
const NEXT_HEADING_RE = /^#{1,6}\s/;
const SEPARATOR_ROW_RE = /^[\s|:-]+$/;

/** Wyciąga surowe wiersze składników (kolumna "PL + SI") z treści notatki. */
export function parseIngredientRows(markdown: string, recipeName: string): RawIngredientRow[] {
	const lines = markdown.split('\n');
	const start = lines.findIndex((line) => HEADING_RE.test(line.trim()));
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
		if (!line.startsWith('|')) {
			continue;
		}
		if (SEPARATOR_ROW_RE.test(line)) {
			continue;
		}
		if (!headerSkipped) {
			// Pierwszy wiersz tabeli to nagłówek kolumn.
			headerSkipped = true;
			continue;
		}
		const cell = extractSecondCell(line);
		if (cell === null) {
			continue;
		}
		const text = cleanCell(cell);
		if (text === '' || isSectionLabel(text)) {
			continue;
		}
		rows.push({ text, recipe: recipeName });
	}

	return rows;
}

/** Druga kolumna wiersza tabeli; toleruje brak zamykającego "|". */
function extractSecondCell(row: string): string | null {
	const cells = row.split('|').slice(1);
	if (cells.length > 0 && (cells[cells.length - 1] ?? '').trim() === '') {
		cells.pop();
	}
	const second = cells[1];
	return second === undefined ? null : second;
}

function cleanCell(cell: string): string {
	return cell
		.trim()
		.replace(/^[*-]\s+/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Etykieta podsekcji ("Masło ziołowe:", "Młoda kapusta:") — nie składnik. */
function isSectionLabel(text: string): boolean {
	return text.endsWith(':');
}
