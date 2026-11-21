import test from 'node:test';
import assert from 'node:assert/strict';

// A small in-memory localStorage, as the browser has.
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear() };

const { hashPassword, verifyPassword, signup, login, upgradeStoredPasswords, signInAsDemo, getCurrentUser } = await import('../js/auth.js');
const { getUsers, saveUser } = await import('../js/store.js');

test('a password is stored as a salted hash, never as text', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.equal(a.alg, 'PBKDF2-SHA256');
  assert.ok(a.iterations >= 100000);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes('correct horse'));
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
});

test('sign up and sign in work with the hash, and nothing stores the password', async () => {
  localStorage.clear();
  await signup({ name: 'Sam', email: 'sam@example.org', password: 's3cret!' });
  assert.ok(!JSON.stringify(getUsers()).includes('s3cret!'));
  await login({ email: 'sam@example.org', password: 's3cret!' });
  await assert.rejects(login({ email: 'sam@example.org', password: 'nope' }), /Invalid email or password/);
});

test('an account saved by an older version is upgraded at start-up', async () => {
  localStorage.clear();
  saveUser({ id: 'u1', name: 'Old', email: 'old@example.org', password: 'legacy1' });
  await upgradeStoredPasswords();
  const u = getUsers().find(x => x.id === 'u1');
  assert.equal(u.password, undefined);
  assert.ok(u.passwordHash?.hash);
  await login({ email: 'old@example.org', password: 'legacy1' });
});

test('the demo account opens without a password', async () => {
  localStorage.clear();
  signInAsDemo();
  assert.equal(getCurrentUser().email, 'demo@mapbridge.local');
  assert.equal(getCurrentUser().password, undefined);
});
