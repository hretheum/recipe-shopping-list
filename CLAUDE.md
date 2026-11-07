# Recipe Shopping List (Obsidian plugin)

Sends recipe ingredients to a Bring! list. TypeScript, esbuild, no runtime dependencies. UI, code comments, tests and docs are English only.

## Commands
- `npm run build` (tsc + esbuild → `main.js`), `npm test`, `npm run lint` (official `eslint-plugin-obsidianmd`).
- Tests never touch a live Bring! account: HTTP is injected (`HttpFn`) and recorded in `test/helpers.mjs`.

## Layout
- `src/main.ts` command flow: pick recipes → log in and fetch lists → choose list → LLM normalization → preview → send → mark sent.
- `src/BringAdapter.ts` unofficial Bring! web API (re-login on 401). `ShoppingListAdapter.ts` is the replaceable interface.
- `src/Normalizer.ts` LLM prompt and parsing. `src/Summer.ts` scaling, summing, rounding, formatting. `IngredientParser.ts`, `DictionaryStore.ts`.
- Modules without an 'obsidian' import are tested directly; `test/build.mjs` bundles them to `test/.build` with a stub of 'obsidian'.

## Rules
- Secrets only in Obsidian's secret storage (`app.secretStorage`); settings store the secret *name*. Never write passwords to `data.json`.
- Follow the Obsidian developer policies and plugin guidelines (README disclosures, no telemetry, sentence-case UI, no `innerHTML`).
- Release: bump `version` in `manifest.json` and `package.json`, add it to `versions.json`, push a tag equal to the version (no `v`).
