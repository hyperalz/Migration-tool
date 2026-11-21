// Sign-in for this demo version of MapBridge.
//
// Accounts live in this web browser only. They are a convenience, not real
// security: anyone who can use this browser can use the projects in it. A
// hosted version with proper sign-in comes later.
//
// Passwords are never stored. Each account keeps a salted PBKDF2-SHA-256 hash
// of its password, made with the browser's own Web Crypto. Accounts saved by
// older versions with a plain-text password are upgraded the next time the
// app starts, and on sign-in.
import { findUserByEmail, saveUser, getSession, setSession, clearSession, getUsers, uid } from './store.js';

const ITERATIONS = 150000;
const DEMO_EMAIL = 'demo@mapbridge.local';

export const AUTH_TEXT = {
  demoNote: 'This is a demo version. Accounts and projects are kept in this web browser only, so anyone who uses this browser can open them. Do not use it for real personal data.',
  wrong: 'Invalid email or password.',
};

const toB64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** A salted hash of the password, safe to store. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITERATIONS);
  return { alg: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), hash: toB64(bits) };
}

/** True when the password matches the stored hash. Compares in constant time. */
export async function verifyPassword(password, stored) {
  if (!stored?.hash || !stored?.salt) return false;
  const bits = new Uint8Array(await derive(password, fromB64(stored.salt), stored.iterations || ITERATIONS));
  const want = fromB64(stored.hash);
  if (bits.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ want[i];
  return diff === 0;
}

export function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) return null;
  return getUsers().find(u => u.id === session.userId) || null;
}

export async function signup({ name, email, password, orgRole }) {
  if (findUserByEmail(email)) {
    throw new Error('An account with this email already exists.');
  }
  const user = saveUser({
    id: uid(),
    name,
    email,
    passwordHash: await hashPassword(password),
    orgRole: orgRole || 'consultant',
    createdAt: new Date().toISOString(),
  });
  setSession(user.id);
  return user;
}

export async function login({ email, password }) {
  const user = findUserByEmail(email);
  if (!user) throw new Error(AUTH_TEXT.wrong);
  let ok;
  if (user.demo) {
    // The demo account is public and has no password.
    ok = true;
  } else if (user.passwordHash) {
    ok = await verifyPassword(password, user.passwordHash);
  } else {
    // An account from an older version: check, then upgrade it.
    ok = typeof user.password === 'string' && user.password === password;
    if (ok) await upgradeUser(user);
  }
  if (!ok) throw new Error(AUTH_TEXT.wrong);
  setSession(user.id);
  return user;
}

export function logout() {
  clearSession();
}

/** The demo account has no password: "Try the demo" opens it directly. */
export function signInAsDemo() {
  const user = seedDemoUser();
  setSession(user.id);
  return user;
}

export function seedDemoUser() {
  const found = findUserByEmail(DEMO_EMAIL);
  if (found) return found;
  return saveUser({
    id: uid(),
    name: 'Demo User',
    email: DEMO_EMAIL,
    demo: true,
    orgRole: 'consultant',
    createdAt: new Date().toISOString(),
  });
}

async function upgradeUser(user) {
  const { password, ...rest } = user;
  if (user.email.toLowerCase() === DEMO_EMAIL) {
    // The demo account no longer has a password at all.
    saveUser({ ...rest, demo: true });
  } else {
    saveUser({ ...rest, passwordHash: await hashPassword(password) });
  }
}

/** Replace any plain-text passwords saved by older versions. Run at start-up. */
export async function upgradeStoredPasswords() {
  for (const user of getUsers()) {
    if (typeof user.password === 'string') await upgradeUser(user);
  }
}
