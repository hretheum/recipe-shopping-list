/*
 * Stub of the 'obsidian' module for tests. The plugin itself is not run, so
 * the UI classes only need their shape: tests touch pure functions from these
 * files, not modal behavior.
 */
export class Modal {
	constructor(app) { this.app = app; this.contentEl = null; }
	open() {}
	close() {}
	setTitle() {}
}
export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	setHeading() { return this; }
	addText() { return this; }
	addButton() { return this; }
	addExtraButton() { return this; }
	addToggle() { return this; }
	addDropdown() { return this; }
	addComponent() { return this; }
}
export class FuzzySuggestModal extends Modal {
	setPlaceholder() {}
}
export class Notice {}
export class SecretComponent {}
export class PluginSettingTab {}
export class Plugin {}
export function normalizePath(p) { return p; }
export function parseYaml() { return {}; }
export function stringifyYaml() { return ''; }
export async function requestUrl() { throw new Error('requestUrl is not available in tests'); }
