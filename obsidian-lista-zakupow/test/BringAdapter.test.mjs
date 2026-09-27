import test from 'node:test';
import assert from 'node:assert/strict';
import { BringAdapter } from './.build/BringAdapter.js';
import { recorder, LOGIN_OK, LISTS_OK, CREATE_OK, SAVE_OK, item } from './helpers.mjs';

const CREDS = { email: 'e@example.com', password: 'tajne' };

test('fetchLists zwraca listy z konta jako {uuid, name}', async () => {
	const { http } = recorder([LOGIN_OK, LISTS_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const lists = await adapter.fetchLists();

	assert.deepStrictEqual(lists, [
		{ uuid: 'L-DOM', name: 'Dom' },
		{ uuid: 'L-DYN', name: 'Dyniowy malaron' },
	]);
});

test('createList wysyła nazwę i motyw, a UUID czyta z klucza bringListUUID', async () => {
	const { http, requests } = recorder([LOGIN_OK, CREATE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const created = await adapter.createList('Najlepsze schabowe na świecie');

	assert.deepStrictEqual(created, { uuid: 'L-NEW', name: 'Najlepsze schabowe na świecie' });
	const post = requests.find((r) => r.method === 'POST' && r.url.endsWith('/lists'));
	assert.equal(post.url, 'https://api.getbring.com/rest/v2/bringusers/U-1/lists');
	assert.equal(post.body, 'name=Najlepsze+schabowe+na+%C5%9Bwiecie&theme=ch.publisheria.bring.theme.home');
});

test('pushItems zapisuje pozycje na liście wskazanej przez UUID', async () => {
	const { http, requests } = recorder([LOGIN_OK, SAVE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const results = await adapter.pushItems('L-DYN', [item()]);

	assert.deepStrictEqual(results.map((r) => r.ok), [true]);
	const puts = requests.filter((r) => r.method === 'PUT');
	assert.equal(puts.length, 1);
	assert.equal(puts[0].url, 'https://api.getbring.com/rest/v2/bringlists/L-DYN');
	assert.match(puts[0].body, /purchase=Koperek/);
	assert.match(puts[0].body, /specification=2%C3%97\+p%C4%99czek\+%E2%80%94\+Schabowe/);
});

test('logowanie wykonuje się raz, choćby adapter obsłużył kilka żądań', async () => {
	const { http, requests } = recorder([LOGIN_OK, LISTS_OK, CREATE_OK, SAVE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	await adapter.fetchLists();
	const created = await adapter.createList('Nowa lista');
	await adapter.pushItems(created.uuid, [item()]);

	const logins = requests.filter((r) => /bringauth/.test(r.url));
	assert.equal(logins.length, 1);
});

test('nieudane logowanie nie zostaje zapamiętane — kolejna próba pyta serwer ponownie', async () => {
	let attempts = 0;
	const { http } = recorder([
		[/^POST .*\/bringauth$/, () => {
			attempts += 1;
			return attempts === 1
				? { status: 401, body: { error: 'invalid_grant' } }
				: { body: { uuid: 'U-1', access_token: 'TOKEN-ABC' } };
		}],
		LISTS_OK,
	]);
	const adapter = new BringAdapter(CREDS, http);

	await assert.rejects(() => adapter.fetchLists(), /logowanie odrzucone/);
	const lists = await adapter.fetchLists();

	assert.equal(lists.length, 2);
	assert.equal(attempts, 2);
});

test('nieudany zapis jednej pozycji nie przerywa wysyłki pozostałych', async () => {
	const { http } = recorder([
		LOGIN_OK,
		[/^PUT .*\/bringlists\//, (request) => (/purchase=Mas%C5%82o/.test(request.body) ? { status: 500, body: '' } : { status: 200, body: '' })],
	]);
	const adapter = new BringAdapter(CREDS, http);

	const results = await adapter.pushItems('L-DOM', [item(), item({ ingredient: 'masło' })]);

	assert.deepStrictEqual(results.map((r) => r.ok), [true, false]);
	assert.match(results[1].error, /HTTP 500/);
});
