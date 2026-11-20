import test from 'node:test';
import assert from 'node:assert/strict';
import { systemTag, fieldTag, fieldPairHtml } from '../js/system-tags.js';

const esc = s => String(s).replace(/</g, '&lt;');

test('each system has a fixed colour class and always carries words', () => {
  assert.match(systemTag('source', esc), /sys-old[^]*Old system/);
  assert.match(systemTag('target', esc), /sys-new[^]*New system/);
  assert.match(systemTag('old', esc, 'Synergy'), /sys-old[^]*Synergy/);
});

test('a matched field shows the old half and the new half in their own colours', () => {
  const html = fieldPairHtml({ sourceTable: 'supplier', sourceColumn: 'sort_code', targetTable: 'Supplier_Load', targetColumn: 'BANK_SORT_CODE' }, esc);
  assert.match(html, /sys-old[^]*supplier\.sort_code[^]*sys-new[^]*Supplier_Load\.BANK_SORT_CODE/);
  assert.match(fieldTag('new', '<x>', esc), /&lt;x>/);
});
