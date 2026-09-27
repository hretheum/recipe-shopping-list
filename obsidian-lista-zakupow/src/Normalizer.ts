import {
	ChatFn,
	DictionarySuggestion,
	NormalizationResult,
	NormalizedIngredient,
	RawIngredientRow,
	UnitDictionary,
} from './types';

/*
 * Normalizator składników. Dostaje surowe wiersze z tabel Ingredients
 * (mogą zawierać wmieszane zdania instrukcji — realna cecha danych
 * z Web Clippera) oraz słownik preferowanych jednostek zakupowych.
 *
 * LLM robi trzy rzeczy naraz dla każdego wiersza:
 * 1. klasyfikuje: składnik czy nie (instrukcja/notka o temperaturze),
 * 2. wyciąga nazwę w mianowniku + ilość + jednostkę,
 * 3. przelicza ilość na preferowaną jednostkę zakupową ze słownika,
 *    a dla składników spoza słownika proponuje nowy wpis.
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
			// Jedna powtórka z informacją o błędzie — lokalne modele czasem
			// psują JSON za pierwszym podejściem.
			raw = await this.chat(
				system,
				`${user}\n\nPoprzednia odpowiedź nie była poprawnym JSON. Odpowiedz WYŁĄCZNIE poprawnym obiektem JSON, bez żadnego tekstu wokół.`,
			);
			parsed = tryParse(raw);
		}
		if (parsed === null) {
			throw new Error('Normalizer: LLM dwukrotnie zwrócił niepoprawny JSON.');
		}

		return toResult(parsed, rows);
	}
}

function buildSystemPrompt(): string {
	return [
		'Jesteś asystentem przekształcającym składniki przepisów kulinarnych w pozycje listy zakupów.',
		'Odpowiadasz WYŁĄCZNIE jednym obiektem JSON, bez markdown i bez komentarzy.',
		'',
		'Dostaniesz ponumerowane wiersze z tabel składników oraz słownik preferowanych jednostek zakupowych.',
		'Dla KAŻDEGO wiersza zwróć obiekt w tablicy "rows":',
		'{"index": <numer wiersza>, "is_ingredient": <true|false>, "ingredient": <string|null>, "quantity": <number|null>, "unit": <string|null>, "optional": <true|false>}',
		'',
		'Zasady:',
		'- is_ingredient=false dla zdań instrukcji ("Pokrój...", "Dodaj...", "Wymieszaj..."), notek o temperaturze piekarnika i innych wierszy niebędących składnikiem; wtedy pozostałe pola daj null/false.',
		'- "ingredient": nazwa w mianowniku liczby pojedynczej, małymi literami, bez przymiotników przygotowania ("drobno posiekanego koperku" → "koperek"). Warianty tego samego produktu scalaj do jednej nazwy.',
		'- Widełki ilości ("1–2 łyżki", "150-200 g", "5–6 cebul") → przyjmij GÓRNĄ granicę (lepiej kupić więcej).',
		'- Jeśli składnik jest w słowniku: przelicz ilość na preferowaną jednostkę ze słownika, używając wiedzy kulinarnej (np. 2 łyżki posiekanego koperku ≈ pół pęczka). Zaokrąglaj W GÓRĘ do sensownej ilości zakupowej.',
		'- Jeśli składnika nie ma w słowniku: sam dobierz sensowną jednostkę ZAKUPOWĄ (szt., pęczek, g, ml, opakowanie, główka, ząbek → przelicz na główki czosnku itd.) i dodaj propozycję do "dictionary_suggestions".',
		'- Dla jednostek sztukowych (szt., pęczek, główka, opakowanie, kostka) "quantity" musi być liczbą całkowitą (zaokrąglij w górę).',
		'- Ilości nieokreślone ("do smaku", "do podania", "do smażenia", "szczypta" bez słownika) → quantity=null, unit=null.',
		'- Prefiks "opcjonalnie:" → optional=true (wiersz nadal jest składnikiem).',
		'- Przyprawy podstawowe (sól, pieprz) traktuj jak składniki z quantity=null — trafią na listę, użytkownik sam zdecyduje.',
		'',
		'Format odpowiedzi:',
		'{"rows": [...], "dictionary_suggestions": [{"ingredient": <string>, "unit": <string>, "note": <string opcjonalnie>}]}',
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
		'Słownik preferowanych jednostek zakupowych:',
		dictLines === '' ? '(pusty)' : dictLines,
		'',
		'Wiersze do przetworzenia:',
		rowLines,
		'',
		'Zwróć obiekt JSON zgodny z formatem z instrukcji systemowej.',
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
	// Modele lokalne potrafią owinąć JSON w ```json ... ``` mimo instrukcji.
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
