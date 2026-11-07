import {
	ChatFn,
	DictionarySuggestion,
	NormalizationResult,
	NormalizedIngredient,
	RawIngredientRow,
	UnitDictionary,
} from './types';

/*
 * Ingredient normalizer. Receives raw rows from recipe ingredient lists
 * (which can contain stray instruction sentences, a real trait of web-clipper
 * output) and a dictionary of preferred shopping units.
 *
 * The LLM does three things per row at once:
 * 1. classifies it: ingredient or not (instruction / oven note),
 * 2. extracts name in the dictionary form + quantity + unit,
 * 3. converts the quantity to the preferred shopping unit from the dictionary,
 *    and proposes a new entry for ingredients that are not in it.
 */
export class Normalizer {
	constructor(private readonly chat: ChatFn) {}

	async normalize(rows: RawIngredientRow[], dictionary: UnitDictionary): Promise<NormalizationResult> {
		if (rows.length === 0) {
			return { items: [], suggestions: [] };
		}

		const system = buildSystemPrompt();
		const user = buildUserPrompt(rows, dictionary);

		let raw = await this.chat(system, user);
		let parsed = tryParse(raw);
		if (parsed === null) {
			// One retry with an error note: local models sometimes break the
			// JSON on the first attempt.
			raw = await this.chat(
				system,
				`${user}\n\nYour previous reply was not valid JSON. Reply with ONLY a valid JSON object, no text around it.`,
			);
			parsed = tryParse(raw);
		}
		if (parsed === null) {
			throw new Error('The LLM returned invalid JSON twice.');
		}

		return toResult(parsed, rows);
	}
}

function buildSystemPrompt(): string {
	return [
		'You turn recipe ingredients into shopping list items.',
		'Reply with ONE JSON object only: no markdown, no comments.',
		'',
		'You get numbered rows taken from recipe ingredient lists, plus a dictionary of preferred shopping units.',
		'The recipes can be in any language. Keep ingredient names in the language of the recipe.',
		'For EVERY row return an object in the "rows" array:',
		'{"index": <row number>, "is_ingredient": <true|false>, "ingredient": <string|null>, "quantity": <number|null>, "unit": <string|null>, "optional": <true|false>}',
		'',
		'Rules:',
		'- is_ingredient=false for instruction sentences ("Chop...", "Add...", "Stir..."), oven temperature notes and any other row that is not an ingredient; then set the other fields to null/false.',
		'- "ingredient": the name in the singular nominative (dictionary) form, lowercase, without preparation adjectives ("finely chopped dill" → "dill"). Merge variants of the same product into one name.',
		'- Quantity ranges ("1–2 tbsp", "150-200 g") → use the UPPER bound (better to buy more).',
		'- If the ingredient is in the dictionary: convert the quantity to the preferred unit using culinary knowledge (e.g. 2 tbsp chopped dill ≈ half a bunch). Round UP to a sensible shopping amount.',
		'- If the ingredient is not in the dictionary: choose a sensible SHOPPING unit yourself (pcs, bunch, g, ml, package, head, ...) and add a proposal to "dictionary_suggestions".',
		'- For countable units (pcs, bunch, head, package, stick, can, jar, clove) "quantity" must be a whole number (round up).',
		'- Unspecified amounts ("to taste", "for serving", "for frying", "a pinch" without a dictionary entry) → quantity=null, unit=null.',
		'- A prefix such as "optional:" → optional=true (the row is still an ingredient).',
		'- Basic seasonings (salt, pepper) are ingredients with quantity=null: they go on the list and the user decides.',
		'',
		'Response format:',
		'{"rows": [...], "dictionary_suggestions": [{"ingredient": <string>, "unit": <string>, "note": <optional string>, "integer": <optional boolean, true for countable units>}]}',
	].join('\n');
}

function buildUserPrompt(rows: RawIngredientRow[], dictionary: UnitDictionary): string {
	const dictLines = Object.entries(dictionary)
		.map(([name, pref]) => `- ${name}: ${pref.unit}${pref.note ? ` (${pref.note})` : ''}`)
		.join('\n');
	const rowLines = rows
		.map((row, i) => `${i + 1}. [${row.recipe}] ${row.text}`)
		.join('\n');
	return [
		'Dictionary of preferred shopping units:',
		dictLines === '' ? '(empty)' : dictLines,
		'',
		'Rows to process:',
		rowLines,
		'',
		'Return a JSON object matching the format from the system instructions.',
	].join('\n');
}

interface LlmRow {
	index: number;
	is_ingredient: boolean;
	ingredient: string | null;
	quantity: number | null;
	unit: string | null;
	optional: boolean;
}

interface LlmResponse {
	rows: LlmRow[];
	dictionary_suggestions: DictionarySuggestion[];
}

function tryParse(raw: string): LlmResponse | null {
	// Local models sometimes wrap the JSON in ```json ... ``` despite instructions.
	const stripped = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
	let data: unknown;
	try {
		data = JSON.parse(stripped);
	} catch {
		return null;
	}
	if (typeof data !== 'object' || data === null || !Array.isArray((data as { rows?: unknown }).rows)) {
		return null;
	}
	const obj = data as { rows: unknown[]; dictionary_suggestions?: unknown };
	const rows: LlmRow[] = [];
	for (const entry of obj.rows) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}
		const e = entry as Record<string, unknown>;
		if (typeof e.index !== 'number' || typeof e.is_ingredient !== 'boolean') {
			continue;
		}
		rows.push({
			index: e.index,
			is_ingredient: e.is_ingredient,
			ingredient: typeof e.ingredient === 'string' ? e.ingredient : null,
			quantity: typeof e.quantity === 'number' && isFinite(e.quantity) ? e.quantity : null,
			unit: typeof e.unit === 'string' && e.unit !== '' ? e.unit : null,
			optional: e.optional === true,
		});
	}
	const suggestions: DictionarySuggestion[] = [];
	if (Array.isArray(obj.dictionary_suggestions)) {
		for (const entry of obj.dictionary_suggestions) {
			if (typeof entry !== 'object' || entry === null) {
				continue;
			}
			const e = entry as Record<string, unknown>;
			if (typeof e.ingredient === 'string' && typeof e.unit === 'string') {
				suggestions.push({
					ingredient: e.ingredient.toLowerCase().trim(),
					unit: e.unit.trim(),
					...(typeof e.note === 'string' && e.note !== '' ? { note: e.note } : {}),
					...(e.integer === true ? { integer: true } : {}),
				});
			}
		}
	}
	return { rows, dictionary_suggestions: suggestions };
}

function toResult(parsed: LlmResponse, rows: RawIngredientRow[]): NormalizationResult {
	const items: NormalizedIngredient[] = [];
	for (const llmRow of parsed.rows) {
		const source = rows[llmRow.index - 1];
		if (source === undefined || !llmRow.is_ingredient) {
			continue;
		}
		if (llmRow.ingredient === null || llmRow.ingredient.trim() === '') {
			continue;
		}
		items.push({
			ingredient: llmRow.ingredient.toLowerCase().trim(),
			quantity: llmRow.quantity,
			unit: llmRow.unit,
			optional: llmRow.optional,
			source: source.recipe,
		});
	}
	return { items, suggestions: parsed.dictionary_suggestions };
}
