import test from 'node:test';
import assert from 'node:assert/strict';
import { Normalizer } from './.build/Normalizer.js';

const rows = [
	{ text: '2 tbsp chopped dill', recipe: 'Soup' },
	{ text: 'Stir well.', recipe: 'Soup' },
];

const GOOD = JSON.stringify({
	rows: [
		{ index: 1, is_ingredient: true, ingredient: 'Dill', quantity: 1, unit: 'bunch', optional: false },
		{ index: 2, is_ingredient: false, ingredient: null, quantity: null, unit: null, optional: false },
	],
	dictionary_suggestions: [{ ingredient: 'Dill', unit: 'bunch', integer: true }],
});

test('keeps ingredients, drops non-ingredient rows and lowercases names', async () => {
	const normalizer = new Normalizer(async () => GOOD);
	const result = await normalizer.normalize(rows, {});
	assert.deepStrictEqual(result.items, [{ ingredient: 'dill', quantity: 1, unit: 'bunch', optional: false, source: 'Soup' }]);
	assert.deepStrictEqual(result.suggestions, [{ ingredient: 'dill', unit: 'bunch', integer: true }]);
});

test('tolerates a markdown code fence around the JSON', async () => {
	const normalizer = new Normalizer(async () => '```json\n' + GOOD + '\n```');
	assert.equal((await normalizer.normalize(rows, {})).items.length, 1);
});

test('retries once with an error note when the first reply is not JSON', async () => {
	const prompts = [];
	const replies = ['not json', GOOD];
	const normalizer = new Normalizer(async (system, user) => { prompts.push(user); return replies.shift(); });
	const result = await normalizer.normalize(rows, {});
	assert.equal(result.items.length, 1);
	assert.equal(prompts.length, 2);
	assert.match(prompts[1], /not valid JSON/);
});

test('fails after two invalid replies', async () => {
	const normalizer = new Normalizer(async () => 'nope');
	await assert.rejects(() => normalizer.normalize(rows, {}), /invalid JSON twice/);
});

test('the prompt contains the dictionary and the numbered rows', async () => {
	let seen = '';
	const normalizer = new Normalizer(async (system, user) => { seen = user; return GOOD; });
	await normalizer.normalize(rows, { dill: { unit: 'bunch', note: 'buy by the bunch' } });
	assert.match(seen, /- dill: bunch \(buy by the bunch\)/);
	assert.match(seen, /1\. \[Soup\] 2 tbsp chopped dill/);
});
