/*
 * Smoke-test zbudowanego bundla: main.js ładuje się na atrapie modułu
 * 'obsidian', rejestruje komendę i przeżywa symulowany restart ustawień.
 * Łapie błędy sklejenia całości, których testy modułowe nie widzą.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const registered = [];

class Notice { constructor(message) { this.message = message; } setMessage() {} hide() {} }
class Modal { constructor(app) { this.app = app; this.contentEl = { empty() {}, createEl() { return { createEl() {} }; } }; } open() {} close() {} setTitle() {} }
class PluginBase {
	constructor(app, manifest) { this.app = app; this.manifest = manifest; this.data = null; }
	addCommand(command) { registered.push(command); }
	addSettingTab() {}
	async loadData() { return this.data; }
	async saveData(data) { this.data = data; }
}
class Setting { setName() { return this; } setDesc() { return this; } setHeading() { return this; } addText() { return this; } addButton() { return this; } addExtraButton() { return this; } addDropdown() { return this; } }

const obsidianStub = {
	App: class {}, Modal, Notice, Plugin: PluginBase, PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
	Setting, FuzzySuggestModal: class extends Modal { setPlaceholder() {} },
	TFile: class {}, normalizePath: (p) => p, parseYaml: () => ({}), stringifyYaml: () => '',
	requestUrl: async () => { throw new Error('bez sieci w teście'); },
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
	if (request === 'obsidian') return obsidianStub;
	return originalLoad.call(this, request, ...rest);
};

/*
 * package.json ma "type": "module", więc .js jest dla Node ESM-em, a bundle
 * wtyczki jest CommonJS-em. Kopiujemy go pod .cjs, żeby require zadziałał.
 */
const bundle = path.join(__dirname, '.build', 'main.cjs');
fs.mkdirSync(path.dirname(bundle), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'main.js'), bundle);
const exported = require(bundle);
const PluginClass = exported.default ?? exported; // esbuild pakuje domyślny eksport pod .default

test('bundle ładuje się i rejestruje komendę wtyczki', async () => {
	const plugin = new PluginClass(new obsidianStub.App(), { id: 'lista-zakupow' });

	await plugin.onload();

	assert.equal(registered.length, 1);
	assert.equal(registered[0].id, 'dodaj-skladniki-do-listy-zakupow');
	assert.equal(typeof registered[0].callback, 'function');
});

test('ustawienia nie mają już pola nazwy listy, a brakujące klucze dostają wartości domyślne', async () => {
	const plugin = new PluginClass(new obsidianStub.App(), { id: 'lista-zakupow' });

	await plugin.loadSettings();

	assert.equal('bringListName' in plugin.settings, false);
	assert.equal(plugin.settings.dictionaryPath, 'ingredient_units.yaml');
	assert.equal(plugin.settings.bringEmail, '');
});

test('ustawienia przeżywają zapis i ponowny odczyt', async () => {
	const plugin = new PluginClass(new obsidianStub.App(), { id: 'lista-zakupow' });
	await plugin.loadSettings();
	plugin.settings.bringEmail = 'ktos@example.com';

	await plugin.saveSettings();
	await plugin.loadSettings();

	assert.equal(plugin.settings.bringEmail, 'ktos@example.com');
});
