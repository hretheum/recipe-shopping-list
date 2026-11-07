import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecretsFs } from './Secrets';

/** Dysk lokalny (wtyczka jest isDesktopOnly, więc moduły Node są dostępne). */
export function nodeSecretsFs(): SecretsFs {
	return {
		home: os.homedir(),
		read(file: string): string | null {
			try {
				return fs.readFileSync(file, 'utf8');
			} catch {
				return null;
			}
		},
		write(file: string, text: string): void {
			fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
			fs.writeFileSync(file, text, { mode: 0o600 });
			fs.chmodSync(file, 0o600);
		},
	};
}
