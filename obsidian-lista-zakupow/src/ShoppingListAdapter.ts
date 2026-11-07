import { AggregatedItem } from './types';

/**
 * Wspólny interfejs adaptera aplikacji zakupowej. Izoluje resztę wtyczki
 * od konkretnego API (decyzja ze spec: Bring! ma nieoficjalne API, więc
 * adapter musi być wymienny — np. na Mealie/Grocy).
 */
export interface ShoppingListAdapter {
	/** Nazwa adaptera do komunikatów ("Bring!"). */
	readonly displayName: string;

	/** Listy dostępne na koncie użytkownika. */
	fetchLists(): Promise<ShoppingList[]>;

	/** Zakłada nową listę i zwraca ją wraz z nadanym identyfikatorem. */
	createList(name: string): Promise<ShoppingList>;

	/** Wysyła pozycje na wskazaną listę. Zwraca raport per pozycja. */
	pushItems(listUuid: string, items: AggregatedItem[]): Promise<PushResult[]>;
}

/** Lista zakupów w aplikacji docelowej. */
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
 * Minimalny kontrakt HTTP zgodny z requestUrl z 'obsidian'.
 * Wstrzykiwany, żeby adapter dało się testować (i logować żądania)
 * bez środowiska Obsidiana i bez wysyłania czegokolwiek na żywo.
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
