import { formatItemName, formatSpecification } from './Summer';
import { HttpFn, HttpRequest, HttpResponse, PushResult, ShoppingList, ShoppingListAdapter } from './ShoppingListAdapter';
import { AggregatedItem } from './types';

/*
 * A minimal client for the unofficial, undocumented Bring! web API. Bring!
 * offers no public API for this; the protocol is modeled on the open-source
 * community client github.com/foxriver76/node-bring-api (src/bring.ts), with
 * one fix: PUT bodies are encoded with URLSearchParams (the reference joins a
 * raw string, which breaks names containing "&" or non-ASCII characters).
 *
 * The API key below is the public key of Bring!'s own web app, not a secret.
 * The API may change or stop working at any time.
 *
 * HTTP comes from outside (HttpFn): at runtime it is requestUrl from
 * 'obsidian' (fetch is subject to CORS, requestUrl is not); in tests it is a
 * request recorder, so nothing reaches a live account.
 */

const BASE_URL = 'https://api.getbring.com/rest/v2/';
const API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp';
/** Theme given to new lists: the app's default. */
const DEFAULT_LIST_THEME = 'ch.publisheria.bring.theme.home';

interface BringCredentials {
	email: string;
	password: string;
}

interface BringSession {
	userUuid: string;
	accessToken: string;
}

interface BringList {
	listUuid: string;
	name: string;
}

export class BringAdapter implements ShoppingListAdapter {
	readonly displayName = 'Bring!';

	constructor(
		private readonly credentials: BringCredentials,
		private readonly http: HttpFn,
	) {}

	/*
	 * The session lives as long as the adapter: the UI fetches lists, the user
	 * picks or creates one, and only then do items go out. Sharing the token
	 * avoids logging in three times.
	 */
	private sessionPromise: Promise<BringSession> | null = null;

	private ensureSession(): Promise<BringSession> {
		if (this.sessionPromise === null) {
			this.sessionPromise = this.login().catch((error: unknown) => {
				this.sessionPromise = null; // a failed login is not kept in memory
				throw error;
			});
		}
		return this.sessionPromise;
	}

	/**
	 * Sends an authenticated request. When the server answers 401 (the token
	 * expired during a long run), logs in again once and retries.
	 */
	private async authed(build: (session: BringSession) => HttpRequest): Promise<HttpResponse> {
		const session = await this.ensureSession();
		const response = await this.http(build(session));
		if (response.status !== 401) {
			return response;
		}
		this.sessionPromise = null;
		return this.http(build(await this.ensureSession()));
	}

	/** GET {base}bringusers/{uuid}/lists. */
	async fetchLists(): Promise<ShoppingList[]> {
		const response = await this.authed((session) => ({
			url: `${BASE_URL}bringusers/${session.userUuid}/lists`,
			method: 'GET',
			headers: this.authHeaders(session),
			throw: false,
		}));
		if (response.status >= 400) {
			throw new Error(`Bring!: could not fetch the lists (HTTP ${response.status}).`);
		}
		const data = response.json as { lists?: BringList[] };
		const lists = Array.isArray(data?.lists) ? data.lists : [];
		return lists.map((list) => ({ uuid: list.listUuid, name: list.name }));
	}

	/**
	 * POST {base}bringusers/{userUuid}/lists creates a list. Same path as
	 * fetching lists, only the method differs (found in the Bring! web app
	 * bundle, confirmed with a live request). Note: the UUID comes back under
	 * bringListUUID, not listUuid as in fetchLists.
	 */
	async createList(name: string): Promise<ShoppingList> {
		const body = new URLSearchParams({ name, theme: DEFAULT_LIST_THEME }).toString();
		const response = await this.authed((session) => ({
			url: `${BASE_URL}bringusers/${session.userUuid}/lists`,
			method: 'POST',
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			headers: this.authHeaders(session),
			body,
			throw: false,
		}));
		if (response.status >= 400) {
			throw new Error(`Bring!: could not create the list "${name}" (HTTP ${response.status}).`);
		}
		const data = response.json as { bringListUUID?: string };
		if (typeof data?.bringListUUID !== 'string') {
			throw new Error('Bring!: the server did not return an identifier for the new list.');
		}
		return { uuid: data.bringListUUID, name };
	}

	async pushItems(listUuid: string, items: AggregatedItem[]): Promise<PushResult[]> {
		const results: PushResult[] = [];
		for (const item of items) {
			try {
				await this.saveItem(listUuid, formatItemName(item), formatSpecification(item));
				results.push({ item, ok: true });
			} catch (error) {
				results.push({ item, ok: false, error: errorMessage(error) });
			}
		}
		return results;
	}

	/** POST {base}bringauth: form-urlencoded email + password. */
	private async login(): Promise<BringSession> {
		const response = await this.http({
			url: `${BASE_URL}bringauth`,
			method: 'POST',
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			headers: this.baseHeaders(),
			body: new URLSearchParams({
				email: this.credentials.email,
				password: this.credentials.password,
			}).toString(),
			throw: false,
		});
		if (response.status >= 400) {
			throw new Error(`Bring!: login rejected (HTTP ${response.status}). Check the email and password in the plugin settings.`);
		}
		const data = response.json as { uuid?: string; access_token?: string; message?: string; error?: string };
		if (typeof data?.error === 'string' || typeof data?.uuid !== 'string' || typeof data?.access_token !== 'string') {
			throw new Error(`Bring!: login failed: ${data?.message ?? 'unexpected server response'}`);
		}
		return { userUuid: data.uuid, accessToken: data.access_token };
	}

	/**
	 * PUT {base}bringlists/{listUuid}: upsert of one item. Sending the same
	 * name again updates the specification instead of creating a duplicate
	 * (item names are unique within a list).
	 */
	private async saveItem(listUuid: string, itemName: string, specification: string): Promise<void> {
		const body = new URLSearchParams({
			purchase: itemName,
			recently: '',
			specification,
			remove: '',
			sender: 'null',
		}).toString();
		const response = await this.authed((session) => ({
			url: `${BASE_URL}bringlists/${listUuid}`,
			method: 'PUT',
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			headers: this.authHeaders(session),
			body,
			throw: false,
		}));
		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status} while saving "${itemName}"`);
		}
	}

	/** Fixed client headers. */
	private baseHeaders(): Record<string, string> {
		return {
			'X-BRING-API-KEY': API_KEY,
			'X-BRING-CLIENT': 'webApp',
			'X-BRING-CLIENT-SOURCE': 'webApp',
			'X-BRING-COUNTRY': 'DE',
		};
	}

	/** Headers after login. */
	private authHeaders(session: BringSession): Record<string, string> {
		return {
			...this.baseHeaders(),
			Authorization: `Bearer ${session.accessToken}`,
			'X-BRING-USER-UUID': session.userUuid,
		};
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
