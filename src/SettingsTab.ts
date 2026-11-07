import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import { fetchModels } from './LlmClient';
import type RecipeShoppingListPlugin from './main';
import { readSecret } from './Secrets';

export class SettingsTab extends PluginSettingTab {
	private models: string[] = [];
	private modelsError = '';

	constructor(
		app: App,
		private readonly plugin: RecipeShoppingListPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		containerEl.createEl('p', {
			text:
				'Sends recipe ingredients to your Bring! shopping list. Recipe text is sent to the LLM endpoint below, ' +
				'and your Bring! login is sent to Bring! (api.getbring.com). Passwords are kept in Obsidian\'s secret storage, not in the vault.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl).setName('LLM (OpenAI-compatible endpoint)').setHeading();

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc('For example http://localhost:11434/v1 (Ollama), http://127.0.0.1:8080/v1 (llama.cpp) or a cloud endpoint.')
			.addText((text) =>
				text
					.setPlaceholder('http://localhost:11434/v1')
					.setValue(settings.llmBaseUrl)
					.onChange(async (value) => {
						settings.llmBaseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Optional. Ollama and llama.cpp ignore it; cloud endpoints require it. Stored in the secret storage.')
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(settings.llmApiKeySecret).onChange(async (value) => {
					settings.llmApiKeySecret = value;
					await this.plugin.saveSettings();
				}),
			);

		const modelSetting = new Setting(containerEl)
			.setName('Model')
			.setDesc(this.modelsError !== '' ? `Could not load models: ${this.modelsError}` : 'Model name on the endpoint. Use the button to load the list from the server.');
		if (this.models.length > 0) {
			modelSetting.addDropdown((dropdown) => {
				const options = new Set([...(settings.llmModel !== '' ? [settings.llmModel] : []), ...this.models]);
				for (const id of options) {
					dropdown.addOption(id, id);
				}
				dropdown.setValue(settings.llmModel).onChange(async (value) => {
					settings.llmModel = value;
					await this.plugin.saveSettings();
				});
			});
		} else {
			modelSetting.addText((text) =>
				text
					.setPlaceholder('llama3.1')
					.setValue(settings.llmModel)
					.onChange(async (value) => {
						settings.llmModel = value.trim();
						await this.plugin.saveSettings();
					}),
			);
		}
		modelSetting.addButton((button) =>
			button.setButtonText('Load models').onClick(async () => {
				try {
					this.models = await fetchModels(settings, readSecret(this.app.secretStorage, settings.llmApiKeySecret));
					this.modelsError = this.models.length === 0 ? 'the server returned no models' : '';
				} catch (error) {
					this.models = [];
					this.modelsError = error instanceof Error ? error.message : String(error);
				}
				this.display();
			}),
		);

		new Setting(containerEl).setName('Bring!').setHeading();

		new Setting(containerEl).setName('Email').addText((text) =>
			text.setValue(settings.bringEmail).onChange(async (value) => {
				settings.bringEmail = value.trim();
				await this.plugin.saveSettings();
			}),
		);

		new Setting(containerEl)
			.setName('Password')
			.setDesc('Choose or create a secret that holds your Bring! password.')
			.addComponent((el) =>
				new SecretComponent(this.app, el).setValue(settings.bringPasswordSecret).onChange(async (value) => {
					settings.bringPasswordSecret = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Recipes').setHeading();

		new Setting(containerEl)
			.setName('Recipe property')
			.setDesc('Frontmatter property that marks a note as a recipe. Leave empty to offer every note.')
			.addText((text) =>
				text.setValue(settings.recipeProperty).onChange(async (value) => {
					settings.recipeProperty = value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Recipe property value')
			.setDesc('Value that marks a recipe. Leave empty to accept any value.')
			.addText((text) =>
				text.setValue(settings.recipeValue).onChange(async (value) => {
					settings.recipeValue = value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Ingredients heading')
			.setDesc('Heading above the ingredient table or list.')
			.addText((text) =>
				text.setValue(settings.ingredientsHeading).onChange(async (value) => {
					settings.ingredientsHeading = value.trim() === '' ? 'Ingredients' : value.trim();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Ingredient table column')
			.setDesc('Column (starting at 1) that holds the ingredient text when the ingredients are in a table.')
			.addText((text) =>
				text.setValue(String(settings.ingredientColumn)).onChange(async (value) => {
					const column = Math.floor(Number(value));
					settings.ingredientColumn = column >= 1 ? column : 2;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Unit dictionary path')
			.setDesc('YAML file with preferred shopping units. It is created automatically when LLM proposals are saved.')
			.addText((text) =>
				text
					.setPlaceholder('ingredient_units.yaml')
					.setValue(settings.dictionaryPath)
					.onChange(async (value) => {
						settings.dictionaryPath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Mark recipes as sent')
			.setDesc('After a successful send, write the date into a frontmatter property of the recipe note.')
			.addToggle((toggle) =>
				toggle.setValue(settings.markSent).onChange(async (value) => {
					settings.markSent = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName('Sent property').addText((text) =>
			text.setValue(settings.sentProperty).onChange(async (value) => {
				settings.sentProperty = value.trim() === '' ? 'shopping_list_sent' : value.trim();
				await this.plugin.saveSettings();
			}),
		);
	}
}
