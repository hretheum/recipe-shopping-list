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
			.setName('Klucz API')
			.setDesc('Opcjonalny — Ollama i llama.cpp go ignorują, endpointy chmurowe wymagają.')
			.addText((text) => {
				text.inputEl.type = 'password';
				return text.setValue(this.plugin.settings.llmApiKey).onChange(async (value) => {
					this.plugin.settings.llmApiKey = value.trim();
					await this.plugin.saveSettings();
				});
			});

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

		new Setting(containerEl).setName('Bring!').setHeading();

		containerEl.createEl('p', {
			text:
				'Uwaga: dane logowania są zapisywane jawnym tekstem w data.json wtyczki. ' +
				'Jeśli synchronizujesz folder .obsidian, wyklucz plik ' +
				'.obsidian/plugins/lista-zakupow/data.json z synchronizacji.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl).setName('E-mail konta Bring!').addText((text) =>
			text.setValue(this.plugin.settings.bringEmail).onChange(async (value) => {
				this.plugin.settings.bringEmail = value.trim();
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl).setName('Hasło konta Bring!').addText((text) => {
			text.inputEl.type = 'password';
			return text.setValue(this.plugin.settings.bringPassword).onChange(async (value) => {
				this.plugin.settings.bringPassword = value;
				await this.plugin.saveSettings();
			});
		});


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
