/*
 * Compiles the modules the tests need into test/.build (ESM).
 * The 'obsidian' import is replaced with a stub, so pure functions from UI
 * files can be tested without running Obsidian.
 */
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
await rm(new URL('./.build/', import.meta.url), { recursive: true, force: true });

await esbuild.build({
	absWorkingDir: root,
	entryPoints: ['src/BringAdapter.ts', 'src/ListSelectionModal.ts', 'src/Secrets.ts', 'src/Summer.ts', 'src/IngredientParser.ts', 'src/Normalizer.ts', 'src/PreviewModal.ts'].filter((f) => existsSync(new URL(f, new URL('..', import.meta.url)))),
	outdir: 'test/.build',
	bundle: true,
	format: 'esm',
	target: 'es2021',
	platform: 'neutral',
	logLevel: 'warning',
	alias: { obsidian: fileURLToPath(new URL('./stubs/obsidian.mjs', import.meta.url)) },
});
