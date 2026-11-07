/*
 * Sekrety (hasło Bring!, klucz LLM) żyją poza vaultem, w pliku .env
 * (domyślnie ~/.config/lista-zakupow/secrets.env, chmod 600). data.json
 * leży w vaultcie, który się synchronizuje, więc nic poufnego tam nie trafia.
 *
 * Moduł bez importu z 'obsidian' i bez dostępu do dysku: system plików
 * dostajemy z zewnątrz (SecretsFs), dzięki czemu da się go testować.
 */

export interface Secrets {
	bringEmail: string;
	bringPassword: string;
	llmApiKey: string;
}

export interface SecretsFs {
	home: string;
	/** Treść pliku albo null, gdy go nie ma. */
	read(path: string): string | null;
	/** Zapisuje plik (katalog 0700, plik 0600). */
	write(path: string, text: string): void;
}

const KEYS: Record<keyof Secrets, string> = {
	bringEmail: 'BRING_EMAIL',
	bringPassword: 'BRING_PASSWORD',
	llmApiKey: 'LLM_API_KEY',
};

export const DEFAULT_SECRETS_PATH = '~/.config/lista-zakupow/secrets.env';

export function expandHome(path: string, home: string): string {
	if (path === '~') {
		return home;
	}
	return path.startsWith('~/') ? `${home}/${path.slice(2)}` : path;
}

/** KEY=value, komentarze #, opcjonalne cudzysłowy i prefiks "export ". */
export function parseEnv(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) {
			continue;
		}
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (match === null) {
			continue;
		}
		let value = (match[2] ?? '').trim();
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1).replace(/\\(["\\$`])/g, '$1');
		} else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
			value = value.slice(1, -1);
		}
		result[match[1] as string] = value;
	}
	return result;
}

export function formatEnv(secrets: Secrets): string {
	const quote = (value: string): string => (/^[A-Za-z0-9_@.+:/-]*$/.test(value) ? value : `"${value.replace(/(["\\$`])/g, '\\$1')}"`);
	return [
		'# Sekrety wtyczki Lista zakupów (Obsidian). Nie wkładaj tego pliku do vaulta ani do gita.',
		`${KEYS.bringEmail}=${quote(secrets.bringEmail)}`,
		`${KEYS.bringPassword}=${quote(secrets.bringPassword)}`,
		`${KEYS.llmApiKey}=${quote(secrets.llmApiKey)}`,
		'',
	].join('\n');
}

export interface LoadedSecrets {
	secrets: Secrets;
	/** Czy plik istnieje. */
	found: boolean;
	path: string;
}

export function loadSecrets(configuredPath: string, fs: SecretsFs): LoadedSecrets {
	const path = expandHome(configuredPath, fs.home);
	const text = fs.read(path);
	const env = text === null ? {} : parseEnv(text);
	return {
		found: text !== null,
		path,
		secrets: {
			bringEmail: env[KEYS.bringEmail] ?? '',
			bringPassword: env[KEYS.bringPassword] ?? '',
			llmApiKey: env[KEYS.llmApiKey] ?? '',
		},
	};
}

/**
 * Jednorazowa migracja: wartości, które siedziały jawnym tekstem w data.json,
 * trafiają do pliku .env (tylko tam, gdzie plik nie ma jeszcze wartości).
 * Zwraca true, gdy plik został zapisany.
 */
export function migrateLegacy(
	configuredPath: string,
	legacy: Partial<Secrets>,
	fs: SecretsFs,
): boolean {
	const loaded = loadSecrets(configuredPath, fs);
	const merged: Secrets = { ...loaded.secrets };
	let changed = false;
	for (const key of Object.keys(KEYS) as Array<keyof Secrets>) {
		const old = legacy[key];
		if (typeof old === 'string' && old !== '' && merged[key] === '') {
			merged[key] = old;
			changed = true;
		}
	}
	if (changed) {
		fs.write(loaded.path, formatEnv(merged));
	}
	return changed;
}
