import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewModal, parseQuantity } from './.build/PreviewModal.js';

test('parseQuantity accepts dot and comma decimals and rejects junk', () => {
	assert.equal(parseQuantity('2'), 2);
	assert.equal(parseQuantity(' 1,5 '), 1.5);
	assert.equal(parseQuantity(''), null);
	assert.equal(parseQuantity('abc'), null);
	assert.equal(parseQuantity('-1'), null);
});

const item = (o) => ({ ingredient: 'dill', quantity: 2, unit: 'bunch', optional: false, sourceRecipes: ['A'], ...o });

test('result applies edits and drops unticked or nameless rows', () => {
	const modal = new PreviewModal({}, [item(), item({ ingredient: 'salt', quantity: null, unit: null })], () => {}, () => {});
	modal.rows[0].name = ' fresh dill ';
	modal.rows[0].quantity = '3';
	modal.rows[1].include = false;
	assert.deepStrictEqual(modal.result(), [item({ ingredient: 'fresh dill', quantity: 3 })]);
	modal.rows[0].name = '  ';
	assert.deepStrictEqual(modal.result(), []);
});
