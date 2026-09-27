/*
 * Rejestrator żądań w miejsce HttpFn. Zapisuje każde wywołanie i odpowiada
 * z tablicy tras — nic nie wychodzi na żywe konto Bring!.
 */
export function recorder(routes) {
	const requests = [];
	const http = async (request) => {
		requests.push({
			method: request.method,
			url: request.url,
			body: request.body,
			headers: request.headers,
			contentType: request.contentType,
		});
		for (const [pattern, respond] of routes) {
			if (pattern.test(`${request.method} ${request.url}`)) {
				const result = typeof respond === 'function' ? respond(request) : respond;
				const text = typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? null);
				let json = null;
				try { json = JSON.parse(text); } catch { json = null; }
				return { status: result.status ?? 200, text, json };
			}
		}
		throw new Error(`Brak atrapy dla: ${request.method} ${request.url}`);
	};
	return { http, requests };
}

export const LOGIN_OK = [
	/^POST .*\/bringauth$/,
	{ body: { uuid: 'U-1', access_token: 'TOKEN-ABC' } },
];

export const LISTS_OK = [
	/^GET .*\/bringusers\/U-1\/lists$/,
	{ body: { lists: [
		{ listUuid: 'L-DOM', name: 'Dom' },
		{ listUuid: 'L-DYN', name: 'Dyniowy malaron' },
	] } },
];

export function item(overrides = {}) {
	return { ingredient: 'koperek', quantity: 2, unit: 'pęczek', optional: false, sourceRecipes: ['Schabowe'], ...overrides };
}

export const CREATE_OK = [
	/^POST .*\/bringusers\/U-1\/lists$/,
	{ body: { bringListUUID: 'L-NEW' } },
];

export const SAVE_OK = [/^PUT .*\/bringlists\/[^/]+$/, { status: 200, body: '' }];
