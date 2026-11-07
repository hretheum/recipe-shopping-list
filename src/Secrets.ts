/*
 * Secrets live in Obsidian's secret storage (app.secretStorage, Obsidian
 * 1.11.4+), which keeps them out of data.json and out of vault sync.
 * The settings only store the *name* of the chosen secret.
 *
 * This module is pure (no 'obsidian' import) so it can be tested directly.
 */

export const DEFAULT_SECRET_IDS = {
	bringPassword: 'recipe-shopping-list-bring-password',
	llmApiKey: 'recipe-shopping-list-llm-api-key',
} as const;

export interface SecretStore {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

/** Value of the named secret, or '' when no name is set or the secret does not exist. */
export function readSecret(store: SecretStore, id: string): string {
	return id === '' ? '' : (store.getSecret(id) ?? '');
}

interface LegacyData {
	bringPassword?: unknown;
	llmApiKey?: unknown;
	bringPasswordSecret?: unknown;
	llmApiKeySecret?: unknown;
}

/**
 * Early versions kept the passwords as plain text in data.json. Move them into
 * the secret storage and drop them from the data. Mutates `data`, returns
 * true when something was migrated (so the caller saves the cleaned data).
 */
export function migratePlaintextSecrets(store: SecretStore, data: LegacyData): boolean {
	let changed = false;
	const move = (legacyKey: 'bringPassword' | 'llmApiKey', secretKey: 'bringPasswordSecret' | 'llmApiKeySecret', id: string): void => {
		if (!(legacyKey in data)) {
			return;
		}
		const value = data[legacyKey];
		delete data[legacyKey];
		changed = true;
		if (typeof value === 'string' && value !== '') {
			store.setSecret(id, value);
			data[secretKey] = id;
		}
	};
	move('bringPassword', 'bringPasswordSecret', DEFAULT_SECRET_IDS.bringPassword);
	move('llmApiKey', 'llmApiKeySecret', DEFAULT_SECRET_IDS.llmApiKey);
	return changed;
}
