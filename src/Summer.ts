import { AggregatedItem, NormalizedIngredient, UnitDictionary } from './types';

/*
 * Summer: groups normalized ingredients by name and unit, sums quantities
 * across recipes and applies the rounding rules from the dictionary.
 * Pure logic with no 'obsidian' dependency, so it is testable standalone.
 */

/** Multiplies every quantity (servings multiplier). Quantities of null stay null. */
export function scaleItems(items: NormalizedIngredient[], factor: number): NormalizedIngredient[] {
	if (!(factor > 0) || factor === 1) {
		return items;
	}
	return items.map((item) => ({
		...item,
		quantity: item.quantity === null ? null : item.quantity * factor,
	}));
}

/** Groups and sums ingredients; the key is name + unit. */
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
		// An item is optional only when EVERY occurrence was optional.
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
	const preferred = pref !== undefined && pref.unit === item.unit ? pref : undefined;
	if (preferred?.round_to !== undefined && preferred.round_to > 0) {
		item.quantity = roundUpToMultiple(item.quantity, preferred.round_to);
		return;
	}
	if (preferred?.integer === true || isCountUnit(item.unit)) {
		item.quantity = Math.ceil(item.quantity - 1e-9);
		return;
	}
	// Clean up floating-point artifacts after summing (0.1 + 0.2 and the like).
	item.quantity = Math.round(item.quantity * 1000) / 1000;
}

function roundUpToMultiple(value: number, step: number): number {
	const rounded = Math.ceil(value / step - 1e-9) * step;
	return Math.round(rounded * 1000) / 1000;
}

const COUNT_UNITS = new Set([
	'pc', 'pcs', 'piece', 'pieces', 'pc.', 'pcs.',
	'bunch', 'bunches',
	'head', 'heads',
	'clove', 'cloves',
	'package', 'packages', 'pack', 'packs',
	'stick', 'sticks',
	'can', 'cans', 'tin', 'tins',
	'jar', 'jars',
	'bottle', 'bottles',
	'loaf', 'loaves',
]);

function isCountUnit(unit: string | null): boolean {
	return unit !== null && COUNT_UNITS.has(unit.toLowerCase());
}

/** Item name for the shopping app (capitalized first letter). */
export function formatItemName(item: AggregatedItem): string {
	const name = item.ingredient;
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Item specification for Bring! (free text: Bring! has no structured
 * quantity/unit fields).
 * Example: "2× bunch (optional) — Schnitzel, Carbonara"
 */
export function formatSpecification(item: AggregatedItem): string {
	const parts: string[] = [];
	if (item.quantity !== null && item.unit !== null) {
		parts.push(`${formatQuantity(item.quantity)}× ${item.unit}`);
	} else if (item.quantity !== null) {
		parts.push(`${formatQuantity(item.quantity)} pcs`);
	}
	if (item.optional) {
		parts.push('(optional)');
	}
	const sources = item.sourceRecipes.join(', ');
	const head = parts.join(' ');
	return head === '' ? sources : `${head} — ${sources}`;
}

export function formatQuantity(quantity: number): string {
	return String(Math.round(quantity * 1000) / 1000);
}
