import { formatItemName, formatSpecification } from './Summer';
import { HttpFn, PushResult, ShoppingList, ShoppingListAdapter } from './ShoppingListAdapter';
import { AggregatedItem } from './types';

/*
 * Własny minimalny klient nieoficjalnego API Bring! (decyzja D1 ze Ścieżki
 * Dowodowej — zaakceptowana). Protokół odwzorowany 1:1 ze źródła
 * github.com/foxriver76/node-bring-api/blob/master/src/bring.ts
 * (odczytanego 2026-07-24), z jedną poprawką: body żądań PUT kodujemy
 * przez URLSearchParams — bring.ts skleja surowy string, co psuje nazwy
 * zawierające "&" lub znaki spoza ASCII; referencyjna biblioteka Pythona
 * (miaucl/bring-api) też koduje poprawnie.
 *
 * HTTP dostajemy z zewnątrz (HttpFn) — w runtime jest to requestUrl
 * z 'obsidian' (fetch podlega CORS, requestUrl nie), w testach rejestrator
 * żądań, dzięki czemu nic nie wychodzi na żywe konto bez zgody.
 */

const BASE_URL = 'https://api.getbring.com/rest/v2/';
const API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp';
/** Motyw nadawany nowym listom — wartość domyślna aplikacji Bring. */
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
	 * Sesja żyje tyle, co adapter: UI pobiera listy, użytkownik wybiera
	 * lub zakłada listę, dopiero potem lecą pozycje. Bez współdzielenia
	 * tokenu byłoby to trzykrotne logowanie.
	 */
	private sessionPromise: Promise<BringSession> | null = null;

	private ensureSession(): Promise<BringSession> {
		if (this.sessionPromise === null) {
			this.sessionPromise = this.login().catch((error: unknown) => {
				this.sessionPromise = null; // nieudane logowanie nie zostaje w pamięci
				throw error;
			});
		}
		return this.sessionPromise;
	}

	/** GET {base}bringusers/{uuid}/lists (bring.ts:188-201). */
	async fetchLists(): Promise<ShoppingList[]> {
		const session = await this.ensureSession();
		return this.loadLists(session);
	}

	private async loadLists(session: BringSession): Promise<ShoppingList[]> {
		const response = await this.http({
			url: `${BASE_URL}bringusers/${session.userUuid}/lists`,
			method: 'GET',
			headers: this.authHeaders(session),
			throw: false,
		});
		if (response.status >= 400) {
			throw new Error(`Bring!: nie udało się pobrać list (HTTP ${response.status}).`);
		}
		const data = response.json as { lists?: BringList[] };
		const lists = Array.isArray(data?.lists) ? data.lists : [];
		return lists.map((list) => ({ uuid: list.listUuid, name: list.name }));
	}

	/**
	 * POST {base}bringusers/{userUuid}/lists — utworzenie listy.
	 * Endpointu nie zna żadna z bibliotek społecznościowych: ścieżka jest ta
	 * sama, co przy pobieraniu list, różni je metoda. Odczytany z bundla
	 * aplikacji webowej Bringa (BRING_API_RESOURCES.lists.create) i potwierdzony
	 * żywym żądaniem 2026-09-20 — szczegóły w docs/sciezka-dowodowa.md.
	 * Uwaga: UUID wraca pod kluczem bringListUUID, nie listUuid jak w loadLists.
	 */
	async createList(name: string): Promise<ShoppingList> {
		const session = await this.ensureSession();
		const body = new URLSearchParams({ name, theme: DEFAULT_LIST_THEME }).toString();
		const response = await this.http({
			url: `${BASE_URL}bringusers/${session.userUuid}/lists`,
			method: 'POST',
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			headers: this.authHeaders(session),
			body,
			throw: false,
		});
		if (response.status >= 400) {
			throw new Error(`Bring!: nie udało się utworzyć listy „${name}" (HTTP ${response.status}).`);
		}
		const data = response.json as { bringListUUID?: string };
		if (typeof data?.bringListUUID !== 'string') {
			throw new Error('Bring!: serwer nie zwrócił identyfikatora nowej listy.');
		}
		return { uuid: data.bringListUUID, name };
	}

	async pushItems(listUuid: string, items: AggregatedItem[]): Promise<PushResult[]> {
		const session = await this.ensureSession();

		const results: PushResult[] = [];
		for (const item of items) {
			try {
				await this.saveItem(session, listUuid, formatItemName(item), formatSpecification(item));
				results.push({ item, ok: true });
			} catch (error) {
				results.push({ item, ok: false, error: errorMessage(error) });
			}
		}
		return results;
	}

	/** POST {base}bringauth — form-urlencoded email+password (bring.ts:154-183). */
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
			throw new Error(
				`Bring!: logowanie odrzucone (HTTP ${response.status}). Sprawdź e-mail i hasło w ustawieniach wtyczki.`,
			);
		}
		const data = response.json as { uuid?: string; access_token?: string; message?: string; error?: string };
		if (typeof data?.error === 'string' || typeof data?.uuid !== 'string' || typeof data?.access_token !== 'string') {
			throw new Error(`Bring!: logowanie nieudane: ${data?.message ?? 'nieoczekiwana odpowiedź serwera'}`);
		}
		return { userUuid: data.uuid, accessToken: data.access_token };
	}

	/**
	 * PUT {base}bringlists/{listUuid} — upsert pozycji (bring.ts:247-258).
	 * Ponowne wysłanie tej samej nazwy aktualizuje specyfikację zamiast
	 * tworzyć duplikat (nazwy pozycji są unikalne w obrębie listy).
	 */
	private async saveItem(
		session: BringSession,
		listUuid: string,
		itemName: string,
		specification: string,
	): Promise<void> {
		const body = new URLSearchParams({
			purchase: itemName,
			recently: '',
			specification,
			remove: '',
			sender: 'null',
		}).toString();
		const response = await this.http({
			url: `${BASE_URL}bringlists/${listUuid}`,
			method: 'PUT',
			contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
			headers: this.authHeaders(session),
			body,
			throw: false,
		});
		if (response.status >= 400) {
			throw new Error(`HTTP ${response.status} przy zapisie "${itemName}"`);
		}
	}

	/** Stałe nagłówki klienta (bring.ts:143-148). */
	private baseHeaders(): Record<string, string> {
		return {
			'X-BRING-API-KEY': API_KEY,
			'X-BRING-CLIENT': 'webApp',
			'X-BRING-CLIENT-SOURCE': 'webApp',
			'X-BRING-COUNTRY': 'DE',
		};
	}

	/** Nagłówki po zalogowaniu (bring.ts:177-182). */
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
