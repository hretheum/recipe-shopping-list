import { AggregatedItem } from './types';

/**
 * Common interface of a shopping-app adapter. It isolates the rest of the
 * plugin from a concrete API (Bring! has an unofficial API, so the adapter
 * must be replaceable).
 */
export interface ShoppingListAdapter {
	/** Adapter name for messages ("Bring!"). */
	readonly displayName: string;

	/** Lists available on the user's account. */
	fetchLists(): Promise<ShoppingList[]>;

	/** Creates a new list and returns it with its assigned identifier. */
	createList(name: string): Promise<ShoppingList>;

	/** Sends items to the given list. Returns a per-item report. */
	pushItems(listUuid: string, items: AggregatedItem[]): Promise<PushResult[]>;
}

/** A shopping list in the target app. */
export interface ShoppingList {
	uuid: string;
	name: string;
}

export interface PushResult {
	item: AggregatedItem;
	ok: boolean;
	error?: string;
}

/**
 * Minimal HTTP contract compatible with requestUrl from 'obsidian'.
 * Injected so the adapter can be tested (and requests recorded) without
 * Obsidian and without sending anything live.
 */
export interface HttpRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	contentType?: string;
	body?: string;
	throw?: boolean;
}

export interface HttpResponse {
	status: number;
	text: string;
	json: unknown;
}

export type HttpFn = (request: HttpRequest) => Promise<HttpResponse>;
