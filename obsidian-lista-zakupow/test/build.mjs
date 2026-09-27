/*
 * Kompiluje moduły potrzebne testom do test/.build (ESM).
 * Import 'obsidian' podmieniamy na atrapę — dzięki temu testujemy czyste
 * funkcje z plików UI bez uruchamiania Obsidiana.
 */
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import esbuild from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
await rm(new URL('./.build/', import.meta.url), { recursive: true, force: true });

await esbuild.build({
	absWorkingDir: root,
	entryPoints: ['src/BringAdapter.ts', 'src/ListSelectionModal.ts'].filter((f) => existsSync(new URL(f, new URL('..', import.meta.url)))),
	outdir: 'test/.build',
	bundle: true,
	format: 'esm',
	target: 'es2021',
	platform: 'neutral',
	logLevel: 'warning',
	alias: { obsidian: fileURLToPath(new URL('./stubs/obsidian.mjs', import.meta.url)) },
});
