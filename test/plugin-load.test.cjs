/*
 * Smoke test of the built bundle: main.js loads on a stub of the 'obsidian'
 * module, registers the command, migrates legacy plaintext passwords into the
 * secret storage and survives a simulated settings restart. Catches assembly
 * errors that module tests do not see.
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
	async saveData(data) { this.data = JSON.parse(JSON.stringify(data)); }
}
class Setting { setName() { return this; } setDesc() { return this; } setHeading() { return this; } addText() { return this; } addButton() { return this; } addExtraButton() { return this; } addDropdown() { return this; } addToggle() { return this; } addComponent() { return this; } }

class App {
	constructor() {
		this.secrets = {};
		this.secretStorage = {
			getSecret: (id) => (id in this.secrets ? this.secrets[id] : null),
			setSecret: (id, value) => { this.secrets[id] = value; },
		};
	}
}

const obsidianStub = {
	App, Modal, Notice, Plugin: PluginBase, PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } },
	Setting, SecretComponent: class {}, FuzzySuggestModal: class extends Modal { setPlaceholder() {} },
	TFile: class {}, normalizePath: (p) => p, parseYaml: () => ({}), stringifyYaml: () => '',
	requestUrl: async () => { throw new Error('no network in tests'); },
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
	if (request === 'obsidian') return obsidianStub;
	return originalLoad.call(this, request, ...rest);
};

/*
 * package.json has "type": "module", so .js is ESM for Node while the plugin
 * bundle is CommonJS. Copy it under .cjs so require works.
 */
const bundle = path.join(__dirname, '.build', 'main.cjs');
fs.mkdirSync(path.dirname(bundle), { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'main.js'), bundle);
const exported = require(bundle);
const PluginClass = exported.default ?? exported; // esbuild packs the default export under .default

test('the bundle loads and registers the plugin command', async () => {
	const plugin = new PluginClass(new App(), { id: 'recipe-shopping-list' });

	await plugin.onload();

	assert.equal(registered.length, 1);
	assert.equal(registered[0].id, 'add-recipe-ingredients');
	assert.equal(typeof registered[0].callback, 'function');
});

test('missing settings keys get their defaults', async () => {
	const plugin = new PluginClass(new App(), { id: 'recipe-shopping-list' });

	await plugin.loadSettings();

	assert.equal(plugin.settings.ingredientsHeading, 'Ingredients');
	assert.equal(plugin.settings.ingredientColumn, 2);
	assert.equal(plugin.settings.markSent, true);
	assert.equal('bringPassword' in plugin.settings, false);
});

test('legacy plaintext passwords move to the secret storage and disappear from data.json', async () => {
	const app = new App();
	const plugin = new PluginClass(app, { id: 'recipe-shopping-list' });
	plugin.data = { bringEmail: 'a@b.c', bringPassword: 'hunter2', llmApiKey: '', llmModel: 'm' };

	await plugin.loadSettings();

	assert.equal(app.secrets['recipe-shopping-list-bring-password'], 'hunter2');
	assert.equal(plugin.settings.bringPasswordSecret, 'recipe-shopping-list-bring-password');
	assert.equal('bringPassword' in plugin.data, false);
	assert.equal(JSON.stringify(plugin.data).includes('hunter2'), false);
});

test('settings survive a save and reload', async () => {
	const plugin = new PluginClass(new App(), { id: 'recipe-shopping-list' });
	await plugin.loadSettings();
	plugin.settings.llmModel = 'another-model';

	await plugin.saveSettings();
	await plugin.loadSettings();

	assert.equal(plugin.settings.llmModel, 'another-model');
});
