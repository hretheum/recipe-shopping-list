import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, formatEnv, loadSecrets, migrateLegacy, expandHome } from './.build/Secrets.js';

const memFs = (files = {}) => ({
	home: '/h',
	files,
	read: (p) => (p in files ? files[p] : null),
	write: (p, t) => { files[p] = t; },
});

test('parseEnv: komentarze, cudzysłowy, export', () => {
	const env = parseEnv('# x\nA=1\nexport B="a b"\nC=\'q\'\n\nzle linia\n');
	assert.deepEqual(env, { A: '1', B: 'a b', C: 'q' });
});

test('formatEnv ↔ parseEnv: hasło ze znakami specjalnymi wraca bez zmian', () => {
	const secrets = { bringEmail: 'a@b.pl', bringPassword: 'p"a$s s#1', llmApiKey: '' };
	const back = parseEnv(formatEnv(secrets));
	assert.equal(back.BRING_EMAIL, 'a@b.pl');
	assert.equal(back.BRING_PASSWORD, 'p"a$s s#1');
});

test('loadSecrets: ~ rozwija się do home, brak pliku = found false', () => {
	assert.equal(expandHome('~/x/y', '/h'), '/h/x/y');
	const r = loadSecrets('~/s.env', memFs({ '/h/s.env': 'BRING_EMAIL=e\nBRING_PASSWORD=p\n' }));
	assert.equal(r.found, true);
	assert.equal(r.secrets.bringPassword, 'p');
	assert.equal(loadSecrets('~/nie.env', memFs()).found, false);
});

test('migrateLegacy: przenosi do pliku, nie nadpisuje istniejących wartości', () => {
	const fs = memFs({ '/h/s.env': 'BRING_EMAIL=zostaje\n' });
	assert.equal(migrateLegacy('~/s.env', { bringEmail: 'stary', bringPassword: 'haslo' }, fs), true);
	const r = loadSecrets('~/s.env', fs);
	assert.equal(r.secrets.bringEmail, 'zostaje');
	assert.equal(r.secrets.bringPassword, 'haslo');
	assert.equal(migrateLegacy('~/s.env', { bringPassword: 'inne' }, fs), false);
});
