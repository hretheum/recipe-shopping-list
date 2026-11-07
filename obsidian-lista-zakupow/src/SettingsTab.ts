import { App, PluginSettingTab, Setting } from 'obsidian';
import type ListaZakupowPlugin from './main';

export class SettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ListaZakupowPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('LLM (endpoint zgodny z OpenAI Chat Completions)').setHeading();

		new Setting(containerEl)
			.setName('Adres bazowy')
			.setDesc('Np. http://localhost:11434/v1 (Ollama), http://127.0.0.1:8080/v1 (llama.cpp) albo endpoint chmurowy.')
			.addText((text) =>
				text
					.setPlaceholder('http://localhost:11434/v1')
					.setValue(this.plugin.settings.llmBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.llmBaseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Nazwa modelu na endpoincie, np. llama3.1 albo qwen2.5:14b.')
			.addText((text) =>
				text
					.setPlaceholder('llama3.1')
					.setValue(this.plugin.settings.llmModel)
					.onChange(async (value) => {
						this.plugin.settings.llmModel = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Sekrety (Bring! i klucz LLM)').setHeading();

		const status = containerEl.createEl('p', { cls: 'setting-item-description' });
		const refresh = (): void => {
			const { secrets, found, path } = this.plugin.readSecrets();
			if (!found) {
				status.setText(`Brak pliku ${path}. Utwórz go z liniami BRING_EMAIL=… i BRING_PASSWORD=… (opcjonalnie LLM_API_KEY=…).`);
				return;
			}
			const present = [
				secrets.bringEmail !== '' ? 'BRING_EMAIL' : null,
				secrets.bringPassword !== '' ? 'BRING_PASSWORD' : null,
				secrets.llmApiKey !== '' ? 'LLM_API_KEY' : null,
			].filter((v): v is string => v !== null);
			status.setText(`Wczytano z ${path}: ${present.length > 0 ? present.join(', ') : 'żadnego klucza'}.`);
		};
		refresh();

		new Setting(containerEl)
			.setName('Plik z sekretami')
			.setDesc('Plik .env poza vaultem (chmod 600). Hasła nie trafiają do data.json ani do synchronizacji vaulta.')
			.addText((text) =>
				text
					.setPlaceholder('~/.config/lista-zakupow/secrets.env')
					.setValue(this.plugin.settings.secretsPath)
					.onChange(async (value) => {
						this.plugin.settings.secretsPath = value.trim();
						await this.plugin.saveSettings();
						refresh();
					}),
			);

		new Setting(containerEl).setName('Słownik jednostek').setHeading();

		new Setting(containerEl)
			.setName('Ścieżka pliku w vaultcie')
			.setDesc('Plik YAML z preferowanymi jednostkami zakupowymi. Powstanie automatycznie, jeśli nie istnieje.')
			.addText((text) =>
				text
					.setPlaceholder('ingredient_units.yaml')
					.setValue(this.plugin.settings.dictionaryPath)
					.onChange(async (value) => {
						this.plugin.settings.dictionaryPath = value.trim();
						await this.plugin.saveSettings();
					}),
			);
	}
}
