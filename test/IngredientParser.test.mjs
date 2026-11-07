import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientRows } from './.build/IngredientParser.js';

const TABLE = `# Soup

## Ingredients
| Original | Normalized |
| :--- | :--- |
| 1 cup rice | 200 g rice |
| * pinch of salt | pinch of salt |
| Herb butter: | Herb butter: |
| 2 eggs | 2 eggs

## Instructions
1. Boil.
`;

test('reads the second table column by default, skipping header, separator and labels', () => {
	const rows = parseIngredientRows(TABLE, 'Soup');
	assert.deepStrictEqual(rows.map((r) => r.text), ['200 g rice', 'pinch of salt', '2 eggs']);
	assert.equal(rows[0].recipe, 'Soup');
});

test('the column is configurable and falls back to the last column on short rows', () => {
	assert.deepStrictEqual(parseIngredientRows(TABLE, 'Soup', 'Ingredients', 1).map((r) => r.text)[0], '1 cup rice');
	assert.equal(parseIngredientRows('## Ingredients\n| a |\n| - |\n| 5 g sugar |\n', 'X', 'Ingredients', 2)[0].text, '5 g sugar');
});

test('bullet and checkbox lists work too', () => {
	const md = '## Ingredients\n- 200 g flour\n* [ ] 2 eggs\n- [x] milk\n1. butter\n\n## Notes\n- not an ingredient\n';
	assert.deepStrictEqual(parseIngredientRows(md, 'Cake').map((r) => r.text), ['200 g flour', '2 eggs', 'milk', 'butter']);
});

test('the heading is configurable and matched case-insensitively at any level', () => {
	const md = '### Zutaten\n- 1 Ei\n';
	assert.deepStrictEqual(parseIngredientRows(md, 'Eier', 'zutaten').map((r) => r.text), ['1 Ei']);
	assert.deepStrictEqual(parseIngredientRows(md, 'Eier'), []);
});

test('regex characters in the heading are taken literally', () => {
	assert.deepStrictEqual(parseIngredientRows('## What (you need)\n- salt\n', 'S', 'What (you need)').map((r) => r.text), ['salt']);
});
