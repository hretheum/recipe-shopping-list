# Recipe Shopping List

Turn the ingredients of your recipe notes into a ready shopping list in [Bring!](https://www.getbring.com), in a few clicks.

**Before:** `2 tbsp finely chopped dill` in one recipe, `1 bunch dill` in another.
**After:** one item `dill` on your list, with the specification `2× bunch — Recipe A, Recipe B`.

## Quick start

You need three things:

1. **A Bring! account** (free). The plugin has no function without one.
2. **An LLM that speaks the OpenAI chat API.** Easiest: [Ollama](https://ollama.com) running locally (nothing leaves your computer). A cloud service with an API key works too.
3. **Recipe notes** with `type: recipe` in the frontmatter and an `## Ingredients` heading (table or list, see [Recipe format](#recipe-format)).

Then: install the plugin, open its settings, fill in the LLM address and your Bring! email and password, and run the command **Add ingredients from recipes to shopping list**.

> **Heads-up: unofficial API.** Bring! offers no public API for this. The plugin uses the same web API as the Bring! web app, so it may stop working at any time and may not be permitted by Bring!'s terms. Use it with your own account and at your own risk. Details are in [Requirements and disclosures](#requirements-and-disclosures).

> **Not affiliated.** This is an independent, community project with no connection to, and no endorsement from, Obsidian or Bring!. "Obsidian" and "Bring!" are trademarks of their respective owners, used only to describe what this plugin works with. Other product names (Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter) are used for reference only, for the same reason.

## Features

- Reads ingredients from a Markdown table or a bullet/checkbox list under a configurable heading.
- Works with any OpenAI-compatible chat endpoint: Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter, and others. A local model keeps your recipes on your machine.
- Normalizes lines such as `2 tbsp finely chopped dill` into `dill`, converts to your preferred shopping unit (for example half a bunch), and drops stray instruction sentences.
- Sums the same ingredient across recipes and rounds up to sensible shopping amounts.
- **Servings multiplier** to scale every quantity.
- **Review before sending:** untick what you already have, fix names, quantities and units. Nothing is sent or created until you confirm.
- **Sent marker:** writes the date into a frontmatter property of the recipe (optional), and the picker lists unsent recipes first.
- Unit dictionary (`ingredient_units.yaml`) in your vault; the LLM proposes entries for new ingredients, which are appended for you to review.
- Re-sending the same item updates it instead of creating a duplicate.

## Installation

From the Community plugins browser (once listed): search for "Recipe Shopping List".

Manual: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/recipe-shopping-list/`, then enable the plugin.

Requires Obsidian 1.11.4 or newer (secret storage).

## Setup

1. **LLM:** set the base URL (for example `http://localhost:11434/v1` for Ollama), optionally choose an API key secret, and pick a model (use **Load models** to list what the server offers). Models that "think" before answering can return an empty reply on some servers: turn reasoning off on the server if you see that.
2. **Bring!:** enter your email and choose or create a secret holding your password.
3. **Recipes:** by default a note counts as a recipe when its frontmatter has `type: recipe`, and the ingredients sit under a heading called `Ingredients`. If your ingredients are in a table, `Ingredient table column` selects the column with the ingredient text (default 2). All of this is configurable.
4. Optional: copy [`ingredient_units.yaml`](ingredient_units.yaml) into your vault and adjust it.

## Usage

Run the command **Add ingredients from recipes to shopping list**:

1. Choose recipes (the active note is preselected) and a servings multiplier.
2. Choose the Bring! list, or create a new one (named after the recipe by default).
3. Review the summed list and confirm.

## Recipe format

Either a table:

```markdown
## Ingredients
| Original | Normalized |
| :--- | :--- |
| 1 cup rice | 200 g rice |
| 2 tbsp chopped dill | 2 tbsp chopped dill |
```

or a list:

```markdown
## Ingredients
- 200 g flour
- [ ] 2 eggs
```

Sub-section labels ending with a colon (`Herb butter:`) are skipped. Ingredients and recipe text can be in any language; ingredient names keep the language of the recipe.

## Requirements and disclosures

Please read this before installing.

- **A Bring! account is required.** The plugin has no function without one.
- **Network use.** The plugin contacts only two kinds of servers:
  1. `api.getbring.com`, to log in to your Bring! account, read your lists, create a list and add items.
  2. The LLM endpoint **you** configure in the settings (by default `http://localhost:11434/v1`). The text of the selected ingredient lines and your unit dictionary are sent to that endpoint. If you point it at a cloud service, that service receives this text.
- **Unofficial API.** Bring! does not publish an API for this. The plugin talks to the same web API that the Bring! web app uses, modeled on the open-source [node-bring-api](https://github.com/foxriver76/node-bring-api). It may stop working at any time, and using it may not be permitted by Bring!'s terms. **Use it at your own risk and with your own account.**
- **Secrets.** Your Bring! password and the optional LLM API key are stored in Obsidian's secret storage (the system keychain), not in `data.json` and not in your vault. The Bring! email is stored in the plugin's `data.json`.
- **No telemetry, no ads, no payments.** The plugin does not collect or send usage data anywhere.
- **Vault enumeration.** To offer your recipes in the picker, the plugin lists the Markdown files in the vault and reads their frontmatter through Obsidian's metadata cache. It opens the content of a note only after you select it. Nothing from this listing is sent anywhere.
- **Files.** The plugin reads the notes you select and your unit dictionary, and it can write the dictionary file and the "sent" frontmatter property. It does not access files outside your vault.

## Troubleshooting

- **The recipe is not listed.** The note needs the frontmatter property and value from the settings (default `type: recipe`).
- **"No ingredient rows found under the … heading".** Check the heading name (default `Ingredients`) and, for tables, the column number in the settings.
- **The model returns an empty or invalid reply.** Models that "think" before answering can return nothing on some servers. Turn reasoning off on the server, or pick another model with **Load models**.
- **Bring! login fails.** Re-check the email and the secret holding the password. Accounts that sign in only through Google or Apple have no password; set one in the Bring! app first.
- **It worked yesterday and now Bring! calls fail.** The unofficial API may have changed. Check the [issues](https://github.com/hretheum/recipe-shopping-list/issues).

## Development

```bash
npm install
npm run build   # tsc + esbuild -> main.js
npm test        # unit and smoke tests (nothing reaches a live account)
npm run lint    # official eslint-plugin-obsidianmd rules
```

Releases are built by GitHub Actions when a tag matching the manifest version (for example `1.0.0`) is pushed.

## License

[MIT](LICENSE)
