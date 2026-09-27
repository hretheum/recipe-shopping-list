/**
 * Funkcja rozmowy z LLM: (prompt systemowy, prompt użytkownika) → treść odpowiedzi.
 * Typ mieszka tutaj (nie w LlmClient), żeby moduły czystej logiki nie
 * importowały niczego zależnego od 'obsidian'.
 */
export type ChatFn = (system: string, user: string) => Promise<string>;

/** Surowy wiersz z tabeli Ingredients (kolumna "PL + SI") przypisany do przepisu. */
export interface RawIngredientRow {
	text: string;
	recipe: string;
}

/** Wpis słownika preferowanych jednostek zakupowych (ingredient_units.yaml). */
export interface UnitPreference {
	unit: string;
	note?: string;
	round_to?: number;
}

export type UnitDictionary = Record<string, UnitPreference>;

/** Pojedynczy składnik po normalizacji przez LLM. */
export interface NormalizedIngredient {
	ingredient: string;
	quantity: number | null;
	unit: string | null;
	optional: boolean;
	source: string;
}

/** Propozycja nowego wpisu do słownika jednostek. */
export interface DictionarySuggestion {
	ingredient: string;
	unit: string;
	note?: string;
}

/** Wynik pracy Normalizera nad całym zbiorem wierszy. */
export interface NormalizationResult {
	items: NormalizedIngredient[];
	suggestions: DictionarySuggestion[];
}

/** Pozycja po zsumowaniu między przepisami — gotowa do wysyłki. */
export interface AggregatedItem {
	ingredient: string;
	quantity: number | null;
	unit: string | null;
	optional: boolean;
	sourceRecipes: string[];
}

export interface ListaZakupowSettings {
	llmBaseUrl: string;
	llmApiKey: string;
	llmModel: string;
	bringEmail: string;
	bringPassword: string;
	dictionaryPath: string;
}

export const DEFAULT_SETTINGS: ListaZakupowSettings = {
	llmBaseUrl: 'http://localhost:11434/v1',
	llmApiKey: '',
	llmModel: 'llama3.1',
	bringEmail: '',
	bringPassword: '',
	dictionaryPath: 'ingredient_units.yaml',
};
