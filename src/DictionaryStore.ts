import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import { DictionarySuggestion, UnitDictionary, UnitPreference } from './types';

const PROPOSED_MARKER = '# --- LLM proposals (review and correct by hand) ---';

/**
 * Store for the preferred-unit dictionary (ingredient_units.yaml in the vault).
 * Reads with the parseYaml built into Obsidian (no runtime dependencies) and
 * appends LLM proposals under a marker so you can see which entries need review.
 */
export class DictionaryStore {
	constructor(
		private readonly app: App,
		private readonly path: string,
	) {}

	async load(): Promise<UnitDictionary> {
		const file = this.getFile();
		if (file === null) {
			return {};
		}
		const content = await this.app.vault.cachedRead(file);
		let data: unknown;
		try {
			data = parseYaml(content);
		} catch {
			throw new Error(`The dictionary ${this.path} is not valid YAML. Fix the file and try again.`);
		}
		if (typeof data !== 'object' || data === null) {
			return {};
		}
		const dictionary: UnitDictionary = {};
		for (const [name, value] of Object.entries(data as Record<string, unknown>)) {
			if (typeof value !== 'object' || value === null) {
				continue;
			}
			const entry = value as Record<string, unknown>;
			if (typeof entry.unit !== 'string' || entry.unit === '') {
				continue;
			}
			const pref: UnitPreference = { unit: entry.unit };
			if (typeof entry.note === 'string' && entry.note !== '') {
				pref.note = entry.note;
			}
			if (typeof entry.round_to === 'number' && entry.round_to > 0) {
				pref.round_to = entry.round_to;
			}
			if (entry.integer === true) {
				pref.integer = true;
			}
			dictionary[name.toLowerCase().trim()] = pref;
		}
		return dictionary;
	}

	/**
	 * Appends proposed new entries (skipping ingredients already present).
	 * Returns how many were actually appended. Safe to run repeatedly:
	 * writing the same proposals again creates no duplicates.
	 */
	async appendSuggestions(suggestions: DictionarySuggestion[], existing: UnitDictionary): Promise<number> {
		const fresh = suggestions.filter(
			(s, index) =>
				existing[s.ingredient] === undefined &&
				suggestions.findIndex((other) => other.ingredient === s.ingredient) === index,
		);
		if (fresh.length === 0) {
			return 0;
		}

		const lines = fresh.map((s) => {
			const note = s.note !== undefined ? `, note: ${JSON.stringify(s.note)}` : '';
			const integer = s.integer === true ? ', integer: true' : '';
			return `${JSON.stringify(s.ingredient)}: {unit: ${JSON.stringify(s.unit)}${note}${integer}}`;
		});

		const file = this.getFile();
		if (file === null) {
			await this.app.vault.create(
				normalizePath(this.path),
				`# Dictionary of preferred shopping units\n\n${PROPOSED_MARKER}\n${lines.join('\n')}\n`,
			);
			return fresh.length;
		}

		await this.app.vault.process(file, (content) => {
			const base = content.endsWith('\n') ? content : `${content}\n`;
			if (base.includes(PROPOSED_MARKER)) {
				return `${base}${lines.join('\n')}\n`;
			}
			return `${base}\n${PROPOSED_MARKER}\n${lines.join('\n')}\n`;
		});
		return fresh.length;
	}

	private getFile(): TFile | null {
		const abstract = this.app.vault.getAbstractFileByPath(normalizePath(this.path));
		return abstract instanceof TFile ? abstract : null;
	}
}
