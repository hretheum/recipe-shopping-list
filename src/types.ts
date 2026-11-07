/**
 * A chat function: (system prompt, user prompt) → reply text.
 * Lives here, not in LlmClient, so pure-logic modules never import anything
 * that depends on 'obsidian'.
 */
export type ChatFn = (system: string, user: string) => Promise<string>;

/** A raw ingredient line taken from a recipe note, tagged with the recipe it came from. */
export interface RawIngredientRow {
	text: string;
	recipe: string;
}

/** A preferred shopping unit for one ingredient (ingredient_units.yaml). */
export interface UnitPreference {
	unit: string;
	note?: string;
	round_to?: number;
	/** The unit is countable, so quantities are rounded up to whole numbers. */
	integer?: boolean;
}

export type UnitDictionary = Record<string, UnitPreference>;

/** A single ingredient after LLM normalization. */
export interface NormalizedIngredient {
	ingredient: string;
	quantity: number | null;
	unit: string | null;
	optional: boolean;
	source: string;
}

/** A suggested new dictionary entry proposed by the LLM. */
export interface DictionarySuggestion {
	ingredient: string;
	unit: string;
	note?: string;
	integer?: boolean;
}

export interface NormalizationResult {
	items: NormalizedIngredient[];
	suggestions: DictionarySuggestion[];
}

/** An item after summing across recipes, ready to send. */
export interface AggregatedItem {
	ingredient: string;
	quantity: number | null;
	unit: string | null;
	optional: boolean;
	sourceRecipes: string[];
}

export interface RecipeShoppingListSettings {
	llmBaseUrl: string;
	llmModel: string;
	/** Name of the secret (in Obsidian's secret storage) that holds the LLM API key. */
	llmApiKeySecret: string;
	bringEmail: string;
	/** Name of the secret (in Obsidian's secret storage) that holds the Bring! password. */
	bringPasswordSecret: string;
	dictionaryPath: string;
	recipeProperty: string;
	recipeValue: string;
	ingredientsHeading: string;
	/** 1-based table column that holds the ingredient text. */
	ingredientColumn: number;
	markSent: boolean;
	sentProperty: string;
}

export const DEFAULT_SETTINGS: RecipeShoppingListSettings = {
	llmBaseUrl: 'http://localhost:11434/v1',
	llmModel: '',
	llmApiKeySecret: '',
	bringEmail: '',
	bringPasswordSecret: '',
	dictionaryPath: 'ingredient_units.yaml',
	recipeProperty: 'type',
	recipeValue: 'recipe',
	ingredientsHeading: 'Ingredients',
	ingredientColumn: 2,
	markSent: true,
	sentProperty: 'shopping_list_sent',
};
