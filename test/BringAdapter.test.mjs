import test from 'node:test';
import assert from 'node:assert/strict';
import { BringAdapter } from './.build/BringAdapter.js';
import { recorder, LOGIN_OK, LISTS_OK, CREATE_OK, SAVE_OK, item } from './helpers.mjs';

const CREDS = { email: 'e@example.com', password: 'secret' };

test('fetchLists returns the account lists as {uuid, name}', async () => {
	const { http } = recorder([LOGIN_OK, LISTS_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const lists = await adapter.fetchLists();

	assert.deepStrictEqual(lists, [
		{ uuid: 'L-HOME', name: 'Home' },
		{ uuid: 'L-PARTY', name: 'Party' },
	]);
});

test('createList sends the name and theme and reads the UUID from bringListUUID', async () => {
	const { http, requests } = recorder([LOGIN_OK, CREATE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const created = await adapter.createList('Best schnitzel & more');

	assert.deepStrictEqual(created, { uuid: 'L-NEW', name: 'Best schnitzel & more' });
	const post = requests.find((r) => r.method === 'POST' && r.url.endsWith('/lists'));
	assert.equal(post.url, 'https://api.getbring.com/rest/v2/bringusers/U-1/lists');
	assert.equal(post.body, 'name=Best+schnitzel+%26+more&theme=ch.publisheria.bring.theme.home');
});

test('pushItems saves items on the list identified by UUID', async () => {
	const { http, requests } = recorder([LOGIN_OK, SAVE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	const results = await adapter.pushItems('L-PARTY', [item()]);

	assert.deepStrictEqual(results.map((r) => r.ok), [true]);
	const puts = requests.filter((r) => r.method === 'PUT');
	assert.equal(puts.length, 1);
	assert.equal(puts[0].url, 'https://api.getbring.com/rest/v2/bringlists/L-PARTY');
	assert.match(puts[0].body, /purchase=Dill/);
	assert.match(puts[0].body, /specification=2%C3%97\+bunch\+%E2%80%94\+Schnitzel/);
});

test('login happens once, however many requests the adapter serves', async () => {
	const { http, requests } = recorder([LOGIN_OK, LISTS_OK, CREATE_OK, SAVE_OK]);
	const adapter = new BringAdapter(CREDS, http);

	await adapter.fetchLists();
	const created = await adapter.createList('New list');
	await adapter.pushItems(created.uuid, [item()]);

	assert.equal(requests.filter((r) => /bringauth/.test(r.url)).length, 1);
});

test('a failed login is not remembered: the next attempt asks the server again', async () => {
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

	await assert.rejects(() => adapter.fetchLists(), /login rejected/);
	const lists = await adapter.fetchLists();

	assert.equal(lists.length, 2);
	assert.equal(attempts, 2);
});

test('a 401 on a request logs in again once and retries with the new token', async () => {
	let logins = 0;
	const tokens = [];
	const { http } = recorder([
		[/^POST .*\/bringauth$/, () => {
			logins += 1;
			return { body: { uuid: 'U-1', access_token: `TOKEN-${logins}` } };
		}],
		[/^GET .*\/lists$/, (request) => {
			tokens.push(request.headers.Authorization);
			return tokens.length === 1 ? { status: 401, body: '' } : { body: { lists: [] } };
		}],
	]);
	const adapter = new BringAdapter(CREDS, http);

	const lists = await adapter.fetchLists();

	assert.deepStrictEqual(lists, []);
	assert.equal(logins, 2);
	assert.deepStrictEqual(tokens, ['Bearer TOKEN-1', 'Bearer TOKEN-2']);
});

test('a failed save of one item does not stop the rest', async () => {
	const { http } = recorder([
		LOGIN_OK,
		[/^PUT .*\/bringlists\//, (request) => (/purchase=Butter/.test(request.body) ? { status: 500, body: '' } : { status: 200, body: '' })],
	]);
	const adapter = new BringAdapter(CREDS, http);

	const results = await adapter.pushItems('L-HOME', [item(), item({ ingredient: 'butter' })]);

	assert.deepStrictEqual(results.map((r) => r.ok), [true, false]);
	assert.match(results[1].error, /HTTP 500/);
});
