/*
 * Atrapa modułu 'obsidian' na potrzeby testów. Wtyczka nie jest uruchamiana,
 * więc klasom UI wystarczy sam kształt — testy dotykają czystych funkcji
 * z tych plików, nie zachowania modali.
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
}
export class FuzzySuggestModal extends Modal {
	setPlaceholder() {}
}
export class Notice {}
export class PluginSettingTab {}
export class Plugin {}
export function normalizePath(p) { return p; }
export function parseYaml() { return {}; }
export function stringifyYaml() { return ''; }
export async function requestUrl() { throw new Error('requestUrl niedostępne w testach'); }
