import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultListName, resolveChoice } from './.build/ListSelectionModal.js';

test('the new list name for one recipe is its title', () => {
	assert.equal(defaultListName(['Best schnitzel in the world']), 'Best schnitzel in the world');
});

test('with several recipes the first title gets a counter of the rest', () => {
	assert.equal(defaultListName(['Schnitzel', 'Carbonara']), 'Schnitzel +1');
	assert.equal(defaultListName(['Schnitzel', 'Carbonara', 'Goulash']), 'Schnitzel +2');
});

test('without recipes the name has a sensible fallback', () => {
	assert.equal(defaultListName([]), 'Shopping');
});

function fakeAdapter() {
	const created = [];
	return {
		created,
		async createList(name) { created.push(name); return { uuid: 'L-NEW', name }; },
	};
}

test('choosing an existing list creates nothing in Bring!', async () => {
	const adapter = fakeAdapter();

	const list = await resolveChoice({ kind: 'existing', uuid: 'L-HOME', name: 'Home' }, adapter);

	assert.deepStrictEqual(list, { uuid: 'L-HOME', name: 'Home' });
	assert.deepStrictEqual(adapter.created, []);
});

test('choosing a new list creates it and returns its UUID', async () => {
	const adapter = fakeAdapter();

	const list = await resolveChoice({ kind: 'new', name: '  Schnitzel  ' }, adapter);

	assert.deepStrictEqual(list, { uuid: 'L-NEW', name: 'Schnitzel' });
	assert.deepStrictEqual(adapter.created, ['Schnitzel']);
});

test('an empty new list name is rejected before any request', async () => {
	const adapter = fakeAdapter();

	await assert.rejects(() => resolveChoice({ kind: 'new', name: '   ' }, adapter), /name/i);

	assert.deepStrictEqual(adapter.created, []);
});
