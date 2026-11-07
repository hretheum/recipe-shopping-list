import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultListName, resolveChoice } from './.build/ListSelectionModal.js';

test('nazwa nowej listy dla jednego przepisu to jego tytuł', () => {
	assert.equal(defaultListName(['Najlepsze schabowe na świecie']), 'Najlepsze schabowe na świecie');
});

test('przy kilku przepisach tytuł pierwszego dostaje licznik pozostałych', () => {
	assert.equal(defaultListName(['Schabowe', 'Carbonara']), 'Schabowe +1');
	assert.equal(defaultListName(['Schabowe', 'Carbonara', 'Żurek']), 'Schabowe +2');
});

test('bez przepisów nazwa ma sensowny zapas', () => {
	assert.equal(defaultListName([]), 'Zakupy');
});

function fakeAdapter() {
	const created = [];
	return {
		created,
		async createList(name) { created.push(name); return { uuid: 'L-NEW', name }; },
	};
}

test('wybór istniejącej listy nie zakłada niczego w Bring', async () => {
	const adapter = fakeAdapter();

	const list = await resolveChoice({ kind: 'existing', uuid: 'L-DOM', name: 'Dom' }, adapter);

	assert.deepStrictEqual(list, { uuid: 'L-DOM', name: 'Dom' });
	assert.deepStrictEqual(adapter.created, []);
});

test('wybór nowej listy zakłada ją i zwraca jej UUID', async () => {
	const adapter = fakeAdapter();

	const list = await resolveChoice({ kind: 'new', name: '  Schabowe  ' }, adapter);

	assert.deepStrictEqual(list, { uuid: 'L-NEW', name: 'Schabowe' });
	assert.deepStrictEqual(adapter.created, ['Schabowe']);
});

test('pusta nazwa nowej listy zostaje odrzucona przed żądaniem', async () => {
	const adapter = fakeAdapter();

	await assert.rejects(() => resolveChoice({ kind: 'new', name: '   ' }, adapter), /nazw/i);

	assert.deepStrictEqual(adapter.created, []);
});
