import test from 'node:test';
import assert from 'node:assert/strict';

const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), dump: () => [...m.values()].join(' ') }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const { getAISettings, saveAISettings, forgetAIKey } = await import('../js/ai-suggestions.js');

test('a key not remembered stays out of long-term storage', () => {
  localStorage.clear(); sessionStorage.clear();
  saveAISettings({ mode: 'llm', baseURL: 'https://api.openai.com/v1', model: 'm', apiKey: 'sk-secret', rememberKey: false });
  assert.ok(!localStorage.dump().includes('sk-secret'));
  assert.equal(getAISettings().apiKey, 'sk-secret');
  sessionStorage.clear(); // the browser window is closed
  assert.equal(getAISettings().apiKey, '');
});

test('a remembered key survives, and can be removed', () => {
  localStorage.clear(); sessionStorage.clear();
  saveAISettings({ mode: 'llm', baseURL: 'https://api.openai.com/v1', model: 'm', apiKey: 'sk-keep', rememberKey: true });
  sessionStorage.clear();
  assert.equal(getAISettings().apiKey, 'sk-keep');
  forgetAIKey();
  assert.equal(getAISettings().apiKey, '');
});

test('settings saved before the choice existed keep their key', () => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('mapbridge_ai_settings', JSON.stringify({ mode: 'llm', apiKey: 'sk-old', baseURL: 'x', model: 'm' }));
  assert.equal(getAISettings().apiKey, 'sk-old');
  assert.equal(getAISettings().rememberKey, true);
});
