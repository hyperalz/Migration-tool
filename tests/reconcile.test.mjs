// Run with: node --test tests/reconcile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLookupRule, parseNumber, parseDate, compareValues, tablePairs, guessKeyMappingIds,
  reconcilePair, buildRun, fingerprintRun, compareRuns, isLikelyPersonal, isLikelyAmount, maskValue,
} from '../js/reconcile.js';
import {
  legacyFinanceSchema, newFinanceSchema, financeMappings, financeKeys, financeDemoExtracts,
} from '../js/demoFinance.js';

test('lookup rules parse in the same format the SQL export uses', () => {
  const { map, unparsed } = parseLookupRule('1 -> Y, 0 => N; X->Z\nnonsense');
  assert.deepEqual([...map], [['1', 'Y'], ['0', 'N'], ['X', 'Z']]);
  assert.deepEqual(unparsed, ['nonsense']);
});

test('numbers and dates are read the UK way', () => {
  assert.equal(parseNumber('1,234.50'), 1234.5);
  assert.equal(parseNumber('(250.00)'), -250);
  assert.equal(parseNumber('£12'), 12);
  assert.equal(parseNumber('12-34-56'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseDate('03/04/2026'), '2026-04-03');
  assert.equal(parseDate('2026-04-03 00:00:00'), '2026-04-03');
  assert.equal(parseDate('31/02/2026'), null);
});

test('value comparison separates format differences from real ones', () => {
  assert.equal(compareValues('abc', 'abc'), 'exact');
  assert.equal(compareValues('abc ', 'abc'), 'format');
  assert.equal(compareValues('100.00', '100'), 'format');
  assert.equal(compareValues('100.00', '100.01'), 'diff');
  assert.equal(compareValues('2026-04-03', '03/04/2026', { targetType: 'date' }), 'format');
  assert.equal(compareValues('2026-04-03', '04/03/2026', { targetType: 'date' }), 'diff');
  assert.equal(compareValues('Smith', 'SMITH'), 'case');
  assert.equal(compareValues('', 'NULL'), 'format');
  assert.equal(compareValues('x', ''), 'diff');
  // leading zeros matter for codes
  assert.equal(compareValues('007', '7'), 'diff');
});

test('personal and amount guesses', () => {
  assert.equal(isLikelyPersonal({ name: 'contact_name' }), true);
  assert.equal(isLikelyPersonal({ name: 'sort_code' }), true);
  assert.equal(isLikelyPersonal({ name: 'vat_code', description: 'Default VAT treatment' }), false);
  assert.equal(isLikelyAmount({ sourceColumn: 'balance', targetColumn: 'AMOUNT' }, { type: 'decimal(14,2)' }, { type: 'decimal' }), true);
  assert.equal(isLikelyAmount({ sourceColumn: 'payment_terms', targetColumn: 'TERMS_DAYS' }, { type: 'int' }, { type: 'integer' }), false);
  assert.equal(isLikelyAmount({ sourceColumn: 'cost_centre', targetColumn: 'COST_CENTRE' }, { type: 'varchar(6)' }, { type: 'string' }), false);
  assert.match(maskValue('Avery Example'), /^•+ \(13 chars\)$/);
});

function demoProject() {
  const mappings = financeMappings.map((m, i) => ({ id: `m${i}`, lookupRule: '', defaultValue: '', ...m }));
  return { name: 'Demo', sourceSystem: 'Legacy', targetSystem: 'New', mappings };
}

function runDemo(load) {
  const project = demoProject();
  const extracts = financeDemoExtracts(load);
  const results = tablePairs(project.mappings).map(pair => {
    const keyIds = pair.mappings.filter(m => financeKeys[pair.id].includes(m.sourceColumn)).map(m => m.id);
    const masked = pair.mappings.filter(m => ['contact_name', 'sort_code'].includes(m.sourceColumn)).map(m => m.id);
    return reconcilePair({
      pair, ...extracts[pair.id], keyMappingIds: keyIds, maskedMappingIds: masked,
      sourceSchema: legacyFinanceSchema, targetSchema: newFinanceSchema,
    });
  });
  return buildRun({ project, label: `Trial load ${load}`, by: 'tester', pairResults: results, at: '2026-11-15T10:00:00.000Z', id: `run${load}` });
}

function kinds(pairResult) {
  return Object.fromEntries(pairResult.groups.map(g => [g.signature.split('::').slice(1).join('::'), g]));
}

test('key guess picks the id column', () => {
  const pairs = tablePairs(demoProject().mappings);
  assert.deepEqual(guessKeyMappingIds(pairs[0]), ['m0']);
});

test('trial load 1: every planted fault is found, and nothing else', () => {
  const run = runDemo(1);
  const [sup, gl] = run.pairs;

  assert.deepEqual(sup.counts, {
    source: 60, target: 59, matched: 58, missingInTarget: 2, unexpectedInTarget: 0,
    duplicateSource: 0, duplicateTarget: 1, blankKeySource: 0, blankKeyTarget: 0,
  });

  const byKind = {};
  for (const g of sup.groups) (byKind[g.kind] ||= []).push(g);

  assert.equal(byKind.missing_record[0].count, 2);
  assert.deepEqual(byKind.missing_record[0].sampleKeys, ['10085', '10330']);
  assert.equal(byKind.duplicate_target[0].count, 1);
  assert.equal(byKind.wrong_translation.length, 1);
  assert.equal(byKind.wrong_translation[0].count, 3);
  assert.match(byKind.wrong_translation[0].title, /"H" should become "On hold" but the new system holds "Inactive"/);
  assert.equal(byKind.no_translation_rule.length, 1);
  assert.equal(byKind.no_translation_rule[0].count, 4);
  assert.equal(byKind.no_translation_rule[0].severity, 'high');
  assert.equal(byKind.truncated[0].count, 3);
  assert.equal(byKind.case_only[0].count, 1);
  assert.equal(byKind.blank_in_target[0].count, 1);
  assert.equal(byKind.value_differs[0].count, 1);
  assert.equal(byKind.total_differs.length, 1);
  assert.deepEqual(Object.keys(byKind).sort(), [
    'blank_in_target', 'case_only', 'duplicate_target', 'missing_record', 'no_translation_rule',
    'total_differs', 'truncated', 'value_differs', 'wrong_translation',
  ]);

  // masked field never leaks its value
  const sortCode = byKind.blank_in_target[0].examples[0];
  assert.match(sortCode.source, /^•+ \(8 chars\)$/);

  // dates differ in layout only and all count as matched
  const dates = sup.fields.find(f => f.sourceColumn === 'last_payment_date');
  assert.equal(dates.mismatched, 0);
  assert.ok(dates.formatOnly > 40);

  // only the balance is totalled
  assert.deepEqual(sup.fields.filter(f => f.total).map(f => f.sourceColumn), ['balance_outstanding']);

  // ledger is clean and its total agrees
  assert.equal(gl.groups.length, 0);
  assert.equal(gl.counts.matched, 48);
  assert.equal(gl.fields.find(f => f.sourceColumn === 'balance').total.diff, 0);

  assert.equal(run.summary.bySeverity.high, 5);
  assert.equal(run.summary.exceptions, 9);
});

test('the balance total difference equals the planted faults', () => {
  const run = runDemo(1);
  const src = financeDemoExtracts(1)['supplier→Supplier_Load'].sourceRows;
  const expected = 100 - Number(src[12].balance_outstanding) - Number(src[47].balance_outstanding) + Number(src[5].balance_outstanding);
  const total = run.pairs[0].fields.find(f => f.sourceColumn === 'balance_outstanding').total;
  assert.equal(total.diff.toFixed(2), expected.toFixed(2));
});

test('trial load 2: fixed, still open and new are separated', () => {
  const run1 = runDemo(1);
  const run2 = runDemo(2);
  const diff = compareRuns(run1, run2);
  assert.deepEqual(diff.stillOpen.map(g => g.kind).sort(), ['no_translation_rule', 'wrong_translation']);
  assert.deepEqual(diff.added.map(g => g.kind), ['blank_in_target']);
  assert.equal(diff.added[0].count, 2);
  assert.equal(diff.fixed.length, 7);
  assert.equal(run2.pairs[0].fields.find(f => f.sourceColumn === 'balance_outstanding').total.diff, 0);
});

test('fingerprint is stable and changes if results are altered', async () => {
  const a = await fingerprintRun(runDemo(1));
  const b = await fingerprintRun(runDemo(1));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  const tampered = runDemo(1);
  tampered.pairs[0].counts.missingInTarget = 0;
  assert.notEqual(await fingerprintRun(tampered), a);
  // recording a review does not change the fingerprint of the results
  const reviewed = runDemo(1);
  reviewed.reviews.push({ role: 'Reviewed', name: 'x', at: 'y' });
  assert.equal(await fingerprintRun(reviewed), a);
});

test('missing columns and missing keys are reported, not ignored', () => {
  const pair = { id: 'a→b', sourceTable: 'a', targetTable: 'b', mappings: [
    { id: 'k', sourceColumn: 'id', targetColumn: 'ID' },
    { id: 'x', sourceColumn: 'x', targetColumn: 'X' },
  ] };
  const res = reconcilePair({ pair, keyMappingIds: ['k'],
    sourceRows: [{ id: '1', x: 'a' }, { id: '', x: 'b' }], targetRows: [{ ID: '1' }] });
  assert.equal(res.fields[1].skipped, 'Column is not in the new system extract');
  assert.ok(res.groups.some(g => g.kind === 'not_checked'));
  assert.ok(res.groups.some(g => g.kind === 'blank_key' && g.count === 1));
  assert.throws(() => reconcilePair({ pair, keyMappingIds: [], sourceRows: [], targetRows: [] }), /at least one key/);
  assert.throws(() => reconcilePair({ pair, keyMappingIds: ['k'], sourceRows: [{ nope: 1 }], targetRows: [{ ID: 1 }] }), /not in the old system extract/);
});

test('default values and blank handling', () => {
  const pair = { id: 'a→b', sourceTable: 'a', targetTable: 'b', mappings: [
    { id: 'k', sourceColumn: 'id', targetColumn: 'ID' },
    { id: 'd', sourceColumn: 'v', targetColumn: 'V', defaultValue: 'N/A' },
  ] };
  const res = reconcilePair({ pair, keyMappingIds: ['k'],
    sourceRows: [{ id: '1', v: '' }, { id: '2', v: '' }, { id: '3', v: 'q' }],
    targetRows: [{ ID: '1', V: 'N/A' }, { ID: '2', V: '' }, { ID: '3', V: 'q' }] });
  const f = res.fields[1];
  assert.equal(f.matched, 2);
  assert.equal(f.mismatched, 1);
  assert.equal(res.groups[0].kind, 'blank_in_target');
});

// ---------- plain-English summary ----------
import { plainSummary, tableNoun, fieldLabel } from '../js/reconcile-plain.js';

const schemaProject = { sourceSchema: legacyFinanceSchema, targetSchema: newFinanceSchema };

test('everyday names for tables and fields', () => {
  assert.equal(tableNoun('gl_balance'), 'GL balance');
  assert.equal(tableNoun('Supplier_Load'), 'supplier load');
  assert.equal(fieldLabel(schemaProject, 'supplier', 'status', 'Supplier_Load', 'STATUS'), 'Supplier status');
  assert.equal(fieldLabel(null, 'a', 'cost_centre', 'b', 'COST_CENTRE'), 'Cost centre');
});

test('plain summary of trial load 1 says what a finance lead needs', () => {
  const run = runDemo(1);
  const p = plainSummary(run, [run], schemaProject);
  assert.equal(p.status.level, 'attention');
  assert.equal(p.status.headline, '5 serious issues to fix before this data can be relied on.');
  assert.deepEqual(p.arrival.map(a => a.ok), [false, true]);
  assert.equal(p.arrival[0].text, 'Of 60 supplier records: 2 did not arrive, 1 was loaded more than once.');
  assert.equal(p.arrival[1].text, 'All 48 GL balance records arrived.');
  assert.deepEqual(p.money.map(m => m.ok), [false, true]);
  assert.match(p.money[0].text, /^The new system is [\d,]+\.\d\d lower than the old one\.$/);
  assert.equal(p.money[1].text, 'The two systems agree to the penny.');
  assert.equal(p.issues.length, 9);
  const texts = p.issues.map(i => i.text);
  assert.ok(texts.includes('On 3 supplier records, supplier status was “H” and should now read “On hold”, but the new system shows “Inactive”.'));
  assert.ok(texts.includes('2 supplier records did not arrive in the new system.'));
  assert.ok(texts.includes('Supplier trading name has been cut short on 3 supplier records.'));
  // no column or table names leak into the plain text
  for (const t of [...texts, ...p.inShort, ...p.arrival.map(a => a.text)]) {
    assert.doesNotMatch(t, /supplier_|SUPPLIER_|Supplier_Load|vat_code|TAX_CODE|→/);
  }
  assert.equal(p.progress, null);
  assert.equal(p.inShort[1], '98.1% of those details matched. 13 did not.');
});

test('plain summary of trial load 2 reports progress', () => {
  const run1 = runDemo(1);
  const run2 = runDemo(2);
  const p = plainSummary(run2, [run1, run2], schemaProject);
  assert.equal(p.progress.text, '7 of the 9 issues found last time have been fixed. 2 remain. 1 new issue has appeared since then.');
  assert.deepEqual(p.trend.map(t => [t.serious, t.other]), [[5, 4], [2, 1]]);
  assert.equal(p.inShort[2], 'Both totals we added up agree between the two systems.');
  assert.equal(p.status.headline, '2 serious issues to fix before this data can be relied on.');
});

test('plain summary when everything matches', () => {
  const pair = { id: 'a→b', sourceTable: 'a', targetTable: 'b', mappings: [{ id: 'k', sourceColumn: 'id', targetColumn: 'ID' }] };
  const res = reconcilePair({ pair, keyMappingIds: ['k'], sourceRows: [{ id: '1' }], targetRows: [{ ID: '1' }] });
  const run = buildRun({ project: { name: 'P', sourceSystem: 'A', targetSystem: 'B', mappings: pair.mappings }, label: 'L', by: 't', pairResults: [res], id: 'r' });
  const p = plainSummary(run, [run], null);
  assert.equal(p.status.level, 'clear');
  assert.equal(p.inShort[1], 'Every detail matched.');
  assert.equal(p.issues.length, 0);
});
