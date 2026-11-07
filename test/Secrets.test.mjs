import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SECRET_IDS, migratePlaintextSecrets, readSecret } from './.build/Secrets.js';

function memStore(initial = {}) {
	const secrets = { ...initial };
	return {
		secrets,
		getSecret: (id) => (id in secrets ? secrets[id] : null),
		setSecret: (id, value) => { secrets[id] = value; },
	};
}

test('readSecret returns an empty string for no name or a missing secret', () => {
	const store = memStore({ a: 'x' });
	assert.equal(readSecret(store, 'a'), 'x');
	assert.equal(readSecret(store, ''), '');
	assert.equal(readSecret(store, 'missing'), '');
});

test('plaintext passwords move into the secret storage and out of the data', () => {
	const store = memStore();
	const data = { bringEmail: 'a@b.c', bringPassword: 'p"a$s', llmApiKey: 'key', llmModel: 'm' };

	assert.equal(migratePlaintextSecrets(store, data), true);

	assert.equal(store.secrets[DEFAULT_SECRET_IDS.bringPassword], 'p"a$s');
	assert.equal(store.secrets[DEFAULT_SECRET_IDS.llmApiKey], 'key');
	assert.equal(data.bringPasswordSecret, DEFAULT_SECRET_IDS.bringPassword);
	assert.equal(data.llmApiKeySecret, DEFAULT_SECRET_IDS.llmApiKey);
	assert.equal('bringPassword' in data, false);
	assert.equal('llmApiKey' in data, false);
	assert.equal(data.bringEmail, 'a@b.c');
});

test('empty legacy values are dropped without creating a secret', () => {
	const store = memStore();
	const data = { bringPassword: '', llmApiKey: '' };

	assert.equal(migratePlaintextSecrets(store, data), true);

	assert.deepStrictEqual(store.secrets, {});
	assert.deepStrictEqual(data, {});
});

test('data without legacy fields is left alone', () => {
	const store = memStore();
	const data = { bringPasswordSecret: 'mine' };

	assert.equal(migratePlaintextSecrets(store, data), false);
	assert.deepStrictEqual(data, { bringPasswordSecret: 'mine' });
});
