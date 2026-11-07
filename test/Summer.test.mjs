import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, scaleItems, formatSpecification, formatItemName } from './.build/Summer.js';

const n = (o) => ({ ingredient: 'dill', quantity: 1, unit: 'bunch', optional: false, source: 'A', ...o });

test('quantities of the same ingredient and unit are summed across recipes', () => {
	const result = aggregate([n({ quantity: 1 }), n({ quantity: 2, source: 'B' })], {});
	assert.equal(result.length, 1);
	assert.equal(result[0].quantity, 3);
	assert.deepStrictEqual(result[0].sourceRecipes, ['A', 'B']);
});

test('an item is optional only when every occurrence is optional', () => {
	assert.equal(aggregate([n({ optional: true }), n({ optional: false, source: 'B' })], {})[0].optional, false);
	assert.equal(aggregate([n({ optional: true }), n({ optional: true, source: 'B' })], {})[0].optional, true);
});

test('countable units are rounded up to whole numbers', () => {
	assert.equal(aggregate([n({ quantity: 1.2 })], {})[0].quantity, 2);
	assert.equal(aggregate([n({ unit: 'pcs', quantity: 2.0000000001 })], {})[0].quantity, 2);
});

test('a dictionary entry can mark a custom unit as countable', () => {
	const dict = { dill: { unit: 'szt.', integer: true } };
	assert.equal(aggregate([n({ unit: 'szt.', quantity: 0.4 })], dict)[0].quantity, 1);
});

test('round_to rounds the sum up to a multiple of the step', () => {
	const dict = { flour: { unit: 'kg', round_to: 0.5 } };
	assert.equal(aggregate([n({ ingredient: 'flour', unit: 'kg', quantity: 0.6 })], dict)[0].quantity, 1);
});

test('floating-point artifacts are cleaned up', () => {
	assert.equal(aggregate([n({ unit: 'g', quantity: 0.1 }), n({ unit: 'g', quantity: 0.2, source: 'B' })], {})[0].quantity, 0.3);
});

test('scaleItems multiplies quantities and keeps nulls', () => {
	const scaled = scaleItems([n({ quantity: 2 }), n({ quantity: null, unit: null })], 3);
	assert.equal(scaled[0].quantity, 6);
	assert.equal(scaled[1].quantity, null);
	assert.equal(scaleItems([n()], 1)[0].quantity, 1);
	assert.equal(scaleItems([n({ quantity: 2 })], 0)[0].quantity, 2);
});

test('scaling then aggregating rounds countable units up', () => {
	const items = aggregate(scaleItems([n({ unit: 'bunch', quantity: 1 })], 1.5), {});
	assert.equal(items[0].quantity, 2);
});

test('specification and name are formatted for the shopping app', () => {
	const item = { ingredient: 'dill', quantity: 2, unit: 'bunch', optional: true, sourceRecipes: ['A', 'B'] };
	assert.equal(formatSpecification(item), '2× bunch (optional) — A, B');
	assert.equal(formatSpecification({ ...item, quantity: null, unit: null, optional: false }), 'A, B');
	assert.equal(formatSpecification({ ...item, unit: null, quantity: 1.5, optional: false }), '1.5 pcs — A, B');
	assert.equal(formatItemName(item), 'Dill');
});
