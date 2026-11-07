import { AggregatedItem, NormalizedIngredient, UnitDictionary } from './types';

/*
 * Sumator: grupuje znormalizowane składniki po nazwie i jednostce,
 * sumuje ilości między przepisami i stosuje zaokrąglenia ze słownika.
 * Czysta logika bez zależności od 'obsidian' — testowalna standalone.
 */

/** Grupuje i sumuje składniki; klucz = nazwa + jednostka. */
export function aggregate(items: NormalizedIngredient[], dictionary: UnitDictionary): AggregatedItem[] {
	const groups = new Map<string, AggregatedItem>();

	for (const item of items) {
		const key = `${item.ingredient}|${item.unit ?? ''}`;
		const existing = groups.get(key);
		if (existing === undefined) {
			groups.set(key, {
				ingredient: item.ingredient,
				quantity: item.quantity,
				unit: item.unit,
				optional: item.optional,
				sourceRecipes: [item.source],
			});
			continue;
		}
		if (item.quantity !== null) {
			existing.quantity = (existing.quantity ?? 0) + item.quantity;
		}
		// Pozycja jest opcjonalna tylko gdy KAŻDE wystąpienie było opcjonalne.
		existing.optional = existing.optional && item.optional;
		if (!existing.sourceRecipes.includes(item.source)) {
			existing.sourceRecipes.push(item.source);
		}
	}

	const result = [...groups.values()];
	for (const item of result) {
		applyRounding(item, dictionary);
	}
	return result;
}

function applyRounding(item: AggregatedItem, dictionary: UnitDictionary): void {
	if (item.quantity === null) {
		return;
	}
	const pref = dictionary[item.ingredient];
	if (pref !== undefined && pref.round_to !== undefined && pref.round_to > 0 && pref.unit === item.unit) {
		item.quantity = roundUpToMultiple(item.quantity, pref.round_to);
		return;
	}
	if (isCountUnit(item.unit)) {
		item.quantity = Math.ceil(item.quantity);
		return;
	}
	// Sprzątanie artefaktów zmiennoprzecinkowych po sumowaniu (0.1 + 0.2 itp.).
	item.quantity = Math.round(item.quantity * 1000) / 1000;
}

function roundUpToMultiple(value: number, step: number): number {
	const rounded = Math.ceil(value / step - 1e-9) * step;
	return Math.round(rounded * 1000) / 1000;
}

const COUNT_UNITS = new Set([
	'szt.', 'szt', 'sztuka', 'sztuki',
	'pęczek', 'pęczki',
	'główka', 'główki',
	'opakowanie', 'opakowania',
	'kostka', 'kostki',
	'puszka', 'puszki',
	'słoik', 'słoiki',
	'bochenek', 'butelka',
	'ząbek', 'ząbki',
]);

function isCountUnit(unit: string | null): boolean {
	return unit !== null && COUNT_UNITS.has(unit.toLowerCase());
}

/** Nazwa pozycji dla appki zakupowej (wielka litera na początku). */
export function formatItemName(item: AggregatedItem): string {
	const name = item.ingredient;
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Specyfikacja pozycji dla Bring! (wolny tekst — Bring nie ma pól
 * strukturalnych ilość/jednostka; ustalenie z researchu).
 * Przykład: "2× pęczek (opcjonalnie) — Schabowe, Carbonara"
 */
export function formatSpecification(item: AggregatedItem): string {
	const parts: string[] = [];
	if (item.quantity !== null && item.unit !== null) {
		parts.push(`${formatQuantity(item.quantity)}× ${item.unit}`);
	} else if (item.quantity !== null) {
		parts.push(`${formatQuantity(item.quantity)} szt.`);
	}
	if (item.optional) {
		parts.push('(opcjonalnie)');
	}
	const sources = item.sourceRecipes.join(', ');
	const head = parts.join(' ');
	return head === '' ? sources : `${head} — ${sources}`;
}

function formatQuantity(quantity: number): string {
	return Number.isInteger(quantity) ? String(quantity) : String(quantity).replace('.', ',');
}
