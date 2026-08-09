import { findUserByEmail, saveUser, getSession, setSession, clearSession, getUsers, uid } from './store.js';

export function getCurrentUser() {
  const session = getSession();
  if (!session?.userId) return null;
  return getUsers().find(u => u.id === session.userId) || null;
}

export function signup({ name, email, password, orgRole }) {
  if (findUserByEmail(email)) {
    throw new Error('An account with this email already exists.');
  }
  const user = saveUser({
    id: uid(),
    name,
    email,
    password,
    orgRole: orgRole || 'consultant',
    createdAt: new Date().toISOString(),
  });
  setSession(user.id);
  return user;
}

export function login({ email, password }) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    throw new Error('Invalid email or password.');
  }
  setSession(user.id);
  return user;
}

export function logout() {
  clearSession();
}

export function seedDemoUser() {
  if (findUserByEmail('demo@mapbridge.local')) return findUserByEmail('demo@mapbridge.local');
  return saveUser({
    id: uid(),
    name: 'Demo User',
    email: 'demo@mapbridge.local',
    password: 'demo123',
    orgRole: 'consultant',
    createdAt: new Date().toISOString(),
  });
}
