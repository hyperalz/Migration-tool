// Run with: node --test tests/reconcile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLookupRule, parseNumber, parseDate, compareValues, tablePairs, guessKeyMappingIds,
  reconcilePair, buildRun, fingerprintRun, compareRuns, compareWithHistory, trendFor, isLikelyPersonal, isLikelyAmount, maskValue,
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
  assert.equal(p.money[1].text, 'The two systems agree exactly.');
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

// ---------- loads that cover different modules ----------

function runDemoPartial(load, pairIds, id, label) {
  const full = runDemo(load);
  return buildRun({
    project: demoProject(), label, by: 'tester', at: '2026-11-15T10:00:00.000Z', id,
    pairResults: full.pairs.filter(p => pairIds.includes(p.id)),
  });
}

const SUP = 'supplier→Supplier_Load';
const LEDGER = 'gl_balance→GL_Opening_Balance';

test('a load is only compared with earlier checks of the same tables', () => {
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Suppliers load 1');
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const sup2 = runDemoPartial(2, [SUP], 'c', 'Suppliers load 2');
  const history = [sup1, gl1, sup2];

  // Ledger checked after suppliers: supplier issues must NOT show as fixed.
  const glChange = compareWithHistory(history, gl1);
  assert.equal(glChange.hasBaseline, false);
  assert.deepEqual(glChange.firstTime, ['gl_balance → GL_Opening_Balance']);
  assert.equal(glChange.fixed.length, 0);
  assert.equal(plainSummary(gl1, history, schemaProject).progress, null);

  // Suppliers load 2 is compared with suppliers load 1, skipping the ledger run in between.
  const supChange = compareWithHistory(history, sup2);
  assert.equal(supChange.singleLabel, 'Suppliers load 1');
  assert.deepEqual([supChange.fixed.length, supChange.stillOpen.length, supChange.added.length], [7, 2, 1]);
  assert.equal(supChange.previousTotal, 9);
  assert.deepEqual(trendFor(history, sup2).map(t => t.label), ['Suppliers load 1', 'Suppliers load 2']);
  assert.equal(plainSummary(sup2, history, schemaProject).progress.previousLabel, 'Suppliers load 1');
});

test('a full load after separate module loads uses each module\u2019s own baseline', () => {
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Suppliers load 1');
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const full = runDemoPartial(2, [SUP, LEDGER], 'c', 'Full load');
  const history = [sup1, gl1, full];
  const change = compareWithHistory(history, full);
  assert.equal(change.singleLabel, null);
  assert.deepEqual(change.baselines.map(b => b.label), ['Suppliers load 1', 'Ledger load 1']);
  assert.deepEqual([change.fixed.length, change.stillOpen.length, change.added.length], [7, 2, 1]);
  const p = plainSummary(full, history, schemaProject);
  assert.equal(p.progress.previousLabel, 'the last check of the same records');
  const trend = trendFor(history, full);
  assert.deepEqual(trend.map(t => [t.label, t.partial]), [['Suppliers load 1', true], ['Ledger load 1', true], ['Full load', false]]);
});

test('a new module added to a later load is flagged as a first check', () => {
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Load 1');
  const both = runDemoPartial(2, [SUP, LEDGER], 'b', 'Load 2');
  const p = plainSummary(both, [sup1, both], schemaProject);
  assert.match(p.progress.text, /This is the first check of the GL balance records, so there is nothing to compare it with yet\.$/);
});

test('quantities other than money are suggested for totals', () => {
  assert.equal(isLikelyAmount({ sourceColumn: 'contracted_hours', targetColumn: 'HOURS' }, { type: 'int' }, { type: 'integer' }), true);
  assert.equal(isLikelyAmount({ sourceColumn: 'fte', targetColumn: 'FTE' }, { type: 'decimal(4,2)' }, null), true);
  assert.equal(isLikelyAmount({ sourceColumn: 'pupil_id', targetColumn: 'PupilID' }, { type: 'int' }, { type: 'integer' }), false);
  assert.equal(isLikelyAmount({ sourceColumn: 'year_group', targetColumn: 'NCYear' }, { type: 'int' }, { type: 'integer' }), false);
});

// ---------- project overview ----------
import { projectOverview, buildAreaSignoff, NO_AREA } from '../js/reconcile-overview.js';
import { mappingStamp } from '../js/reconcile.js';

test('overview: nothing checked is incomplete, never clear', () => {
  const o = projectOverview(demoProject(), []);
  assert.equal(o.summary.status.level, 'incomplete');
  assert.equal(o.summary.status.headline, '2 tables have not been checked yet.');
  assert.deepEqual(o.tables.map(t => t.state), ['not_checked', 'not_checked']);
  assert.deepEqual(o.areas.map(a => [a.name, a.status]), [['Accounts payable', 'incomplete'], ['General ledger', 'incomplete']]);
});

test('overview: a clean table does not hide an unchecked one', () => {
  const gl = runDemoPartial(1, [LEDGER], 'g', 'Ledger load 1');
  const o = projectOverview(demoProject(), [gl]);
  assert.equal(o.tables.find(t => t.id === LEDGER).status, 'clear');
  assert.equal(o.summary.status.level, 'incomplete');
  assert.equal(o.summary.checked, 1);
  assert.equal(o.summary.areasClear, 1);
});

test('overview: worst status wins and each table uses its own latest check', () => {
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Suppliers load 1');
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const sup2 = runDemoPartial(2, [SUP], 'c', 'Suppliers load 2');
  const o = projectOverview(demoProject(), [sup1, gl1, sup2]);
  const sup = o.tables.find(t => t.id === SUP);
  assert.equal(sup.run.label, 'Suppliers load 2');
  assert.deepEqual(sup.trend, [9, 3]);
  assert.deepEqual(sup.issues, { high: 2, medium: 1, low: 0, total: 3 });
  assert.equal(o.tables.find(t => t.id === LEDGER).run.label, 'Ledger load 1');
  assert.equal(o.summary.status.level, 'attention');
  assert.equal(o.summary.status.headline, '2 serious issues open across 1 area.');
  assert.deepEqual(o.areas.map(a => a.status), ['attention', 'clear']);
});

test('overview: a final load judges every table on that load alone', () => {
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Suppliers load 1');
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const o = projectOverview(demoProject(), [sup1, gl1], { finalRunId: 'b' });
  const sup = o.tables.find(t => t.id === SUP);
  assert.equal(sup.state, 'not_checked');
  assert.deepEqual(sup.notes, ['Not included in the final load']);
  assert.equal(o.summary.status.level, 'incomplete');
  assert.equal(o.summary.status.headline, '1 table was not in the final load.');
  assert.equal(o.summary.finalRun.label, 'Ledger load 1');
});

test('overview: changing a mapping after a check flags the table for re-checking', () => {
  const project = demoProject();
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const sup = runDemoPartial(2, [SUP], 'c', 'Suppliers load 2');
  assert.equal(projectOverview(project, [gl1, sup]).tables.find(t => t.id === LEDGER).mappingsChanged, false);
  project.mappings.find(m => m.sourceColumn === 'cost_centre').lookupRule = 'E1010 -> ED1010';
  const o = projectOverview(project, [gl1, sup]);
  const gl = o.tables.find(t => t.id === LEDGER);
  assert.equal(gl.mappingsChanged, true);
  assert.equal(gl.status, 'incomplete');
  assert.equal(o.summary.recheck, 1);
});

test('overview: a sign-off only counts for the checks it was made against', () => {
  const project = demoProject();
  const gl1 = runDemoPartial(1, [LEDGER], 'b', 'Ledger load 1');
  const before = projectOverview(project, [gl1]);
  const area = before.areas.find(a => a.name === 'General ledger');
  const signoff = buildAreaSignoff(area, { name: 'Finance lead', role: 'Signed off', note: '' });
  const signed = projectOverview(project, [gl1], { signoffs: [signoff] });
  assert.equal(signed.areas.find(a => a.name === 'General ledger').signoffCurrent, true);
  assert.equal(signed.summary.areasSigned, 1);
  // recording "Not signed off" does not count as signed
  const refused = buildAreaSignoff(area, { name: 'Finance lead', role: 'Not signed off', note: '' });
  assert.equal(projectOverview(project, [gl1], { signoffs: [signoff, refused] }).summary.areasSigned, 0);
  // a later check of the same table supersedes the sign-off
  const gl2 = runDemoPartial(2, [LEDGER], 'd', 'Ledger load 2');
  const later = projectOverview(project, [gl1, gl2], { signoffs: [signoff] });
  assert.equal(later.areas.find(a => a.name === 'General ledger').signoffCurrent, false);
  assert.equal(later.summary.areasSigned, 0);
});

test('overview: tables with no service area are grouped, not dropped', () => {
  const project = demoProject();
  for (const m of project.mappings) if (m.sourceTable === 'gl_balance') m.serviceArea = '';
  const o = projectOverview(project, []);
  assert.deepEqual(o.areas.map(a => a.name), ['Accounts payable', NO_AREA]);
});

test('mapping stamp is stable and order independent', () => {
  const pairs = tablePairs(demoProject().mappings);
  const reversed = { ...pairs[0], mappings: [...pairs[0].mappings].reverse() };
  assert.equal(mappingStamp(pairs[0]), mappingStamp(reversed));
  assert.notEqual(mappingStamp(pairs[0]), mappingStamp(pairs[1]));
});

// ---------- project progress ----------
import { projectProgress, stepForScreen } from '../js/progress.js';
import { buildExportPackage, evidenceDigest } from '../js/export.js';

function emptyProject() {
  return { name: 'P', sourceSystem: 'Old', targetSystem: 'New', sourceSchema: null, targetSchema: null, mappings: [] };
}
function schemaProjectFull(extra = {}) {
  return { ...demoProject(), sourceSchema: legacyFinanceSchema, targetSchema: newFinanceSchema, ...extra };
}
const states = p => Object.fromEntries(projectProgress(p).steps.map(s => [s.key, s.state]));

test('progress: a new project starts at set up and later steps are blocked', () => {
  const pr = projectProgress(emptyProject());
  assert.deepEqual(states(emptyProject()), { setup: 'todo', map: 'blocked', check: 'blocked', signoff: 'blocked', handover: 'blocked' });
  assert.equal(pr.next.step, 'setup');
  assert.equal(pr.next.text, 'Add the field lists for both systems');
});

test('progress: field lists loaded, nothing mapped', () => {
  const p = { ...emptyProject(), sourceSchema: legacyFinanceSchema, targetSchema: newFinanceSchema };
  assert.deepEqual(states(p), { setup: 'done', map: 'todo', check: 'blocked', signoff: 'blocked', handover: 'blocked' });
  assert.equal(projectProgress(p).next.text, 'Start mapping fields');
});

test('progress: required new-system fields without a source keep mapping in progress', () => {
  const p = schemaProjectFull();
  p.mappings = p.mappings.filter(m => m.targetColumn !== 'STATUS');
  const pr = projectProgress(p);
  assert.equal(pr.steps[1].state, 'progress');
  assert.match(pr.steps[1].summary, /1 required field in the new system still has no source\.$/);
  assert.equal(pr.next.step, 'map');
});

test('progress: mapped but nothing checked points at the first load', () => {
  const p = schemaProjectFull();
  assert.deepEqual(states(p), { setup: 'done', map: 'done', check: 'todo', signoff: 'blocked', handover: 'todo' });
  assert.equal(projectProgress(p).next.text, 'Check the first trial load');
});

test('progress: issues open keeps checking in progress; sign-off opens up', () => {
  const p = schemaProjectFull({ reconRuns: [runDemo(1)] });
  const pr = projectProgress(p);
  assert.equal(pr.steps[2].state, 'progress');
  assert.equal(pr.steps[3].state, 'todo');
  assert.equal(pr.next.step, 'check');
  assert.equal(pr.next.text, 'Fix the open issues, then check the next load');
});

test('progress: one module checked points at the tables still waiting', () => {
  const p = schemaProjectFull({ reconRuns: [runDemoPartial(1, [LEDGER], 'g', 'Ledger 1')] });
  assert.equal(projectProgress(p).next.text, 'Check a load for the 1 table still waiting');
});

test('progress: sign-off is done only with every area signed, a final load, and nothing open', () => {
  const gl = runDemoPartial(1, [LEDGER], 'g', 'Ledger final');
  // a project with only the ledger mapped, so one clean load covers everything
  const p = schemaProjectFull({ reconRuns: [gl] });
  p.mappings = p.mappings.filter(m => m.sourceTable === 'gl_balance');
  p.sourceSchema = { ...legacyFinanceSchema, tables: legacyFinanceSchema.tables.filter(t => t.name === 'gl_balance') };
  p.targetSchema = { ...newFinanceSchema, tables: newFinanceSchema.tables.filter(t => t.name === 'GL_Opening_Balance') };
  assert.equal(projectProgress(p).steps[2].state, 'done');
  assert.equal(projectProgress(p).steps[3].state, 'todo');
  const area = projectProgress(p).overview.areas[0];
  p.reconAreaSignoffs = [buildAreaSignoff(area, { name: 'Lead', role: 'Signed off', note: '' })];
  assert.equal(projectProgress(p).steps[3].state, 'progress');
  assert.equal(projectProgress(p).next.text, 'Choose the final load once it has been run and checked');
  p.reconFinalRunId = 'g';
  const done = projectProgress(p);
  assert.equal(done.steps[3].state, 'done');
  assert.equal(done.next.step, 'handover');
});

test('progress: screens map to steps', () => {
  assert.equal(stepForScreen('verify').key, 'check');
  assert.equal(stepForScreen('reconcile').key, 'check');
  assert.equal(stepForScreen('invite').key, 'setup');
  assert.equal(stepForScreen('overview').key, 'signoff');
  assert.equal(stepForScreen('home'), null);
});

test('evidence pack includes checked loads and sign-offs, and its digest tracks changes', () => {
  const p = schemaProjectFull({ id: 'x', status: 'mapping', reconRuns: [runDemo(1)], reconFinalRunId: 'run1', reconAreaSignoffs: [{ area: 'A' }] });
  const pkg = buildExportPackage(p, { email: 'a@b' });
  assert.equal(pkg.reconciliation.runs.length, 1);
  assert.equal(pkg.reconciliation.finalRunId, 'run1');
  assert.equal(pkg.summary.checkedLoads, 1);
  const d1 = evidenceDigest(pkg);
  assert.equal(evidenceDigest(buildExportPackage(p, { email: 'someone@else' })), d1);
  p.reconRuns.push(runDemo(2));
  assert.notEqual(evidenceDigest(buildExportPackage(p, { email: 'a@b' })), d1);
});

test('progress: hand-over is done only while the downloaded pack matches the project', () => {
  const p = schemaProjectFull({ id: 'x', status: 'mapping', reconRuns: [runDemo(1)] });
  assert.equal(projectProgress(p).steps[4].state, 'todo');
  p.lastEvidenceExportAt = '2026-11-15T12:00:00.000Z';
  p.lastEvidenceDigest = evidenceDigest(buildExportPackage(p, null));
  assert.equal(projectProgress(p).steps[4].state, 'done');
  p.reconRuns.push(runDemo(2));
  const after = projectProgress(p).steps[4];
  assert.equal(after.state, 'progress');
  assert.match(after.summary, /^The project has changed since the evidence pack was downloaded/);
});

// ---------- field tracker linked to load checks ----------
import { fieldCheckIndex, trackerConflicts, checkNote } from '../js/field-checks.js';

const byCol = (project, index, col) => index.get(project.mappings.find(m => m.sourceColumn === col).id);

test('field checks: each field shows what the latest check of its table found', () => {
  const project = demoProject();
  const idx = fieldCheckIndex(project, [runDemo(1)]);
  assert.equal(idx.size, 13);
  assert.equal(byCol(project, idx, 'payment_terms').state, 'pass');
  const status = byCol(project, idx, 'status');
  assert.equal(status.state, 'fail');
  assert.equal(status.mismatched, 3);
  assert.equal(status.findings[0].severity, 'high');
  assert.equal(status.run.label, 'Trial load 1');
  // a field whose values all match but whose total differs is still failing
  const bal = byCol(project, idx, 'balance_outstanding');
  assert.equal(bal.state, 'fail');
  assert.ok(bal.findings.some(f => f.kind === 'total_differs'));
  // whole-record problems are carried as context for every field in the table
  assert.ok(byCol(project, idx, 'payment_terms').tableFindings.some(f => /missing from the new system/.test(f.title)));
  assert.equal(byCol(project, idx, 'balance').tableFindings.length, 0);
  assert.equal(checkNote(status), 'Latest load check found differences (Trial load 1).');
});

test('field checks: unchecked tables, later loads and the final load', () => {
  const project = demoProject();
  const sup1 = runDemoPartial(1, [SUP], 'a', 'Suppliers load 1');
  const sup2 = runDemoPartial(2, [SUP], 'b', 'Suppliers load 2');
  let idx = fieldCheckIndex(project, [sup1]);
  assert.equal(byCol(project, idx, 'balance').state, 'not_checked');
  assert.equal(byCol(project, idx, 'supplier_name').state, 'fail');
  idx = fieldCheckIndex(project, [sup1, sup2]);
  assert.equal(byCol(project, idx, 'supplier_name').state, 'pass');
  assert.equal(byCol(project, idx, 'supplier_name').run.label, 'Suppliers load 2');
  // final load = load 1: judged on that, not on the later load
  idx = fieldCheckIndex(project, [sup1, sup2], { finalRunId: 'a' });
  assert.equal(byCol(project, idx, 'supplier_name').state, 'fail');
  assert.equal(byCol(project, idx, 'balance').reason, 'This table was not in the final load');
});

test('field checks: a changed mapping needs re-checking; a new field is not checked', () => {
  const project = demoProject();
  const run = runDemo(2);
  project.mappings.find(m => m.sourceColumn === 'vat_code').lookupRule = 'S -> STD, Z -> ZERO, E -> EXEMPT, R -> REV';
  let idx = fieldCheckIndex(project, [run]);
  assert.equal(byCol(project, idx, 'vat_code').state, 'recheck');
  assert.equal(byCol(project, idx, 'balance').state, 'pass');
  project.mappings.push({ id: 'new', sourceTable: 'gl_balance', sourceColumn: 'x', targetTable: 'GL_Opening_Balance', targetColumn: 'X' });
  idx = fieldCheckIndex(project, [run]);
  assert.equal(idx.get('new').state, 'not_checked');
});

test('field checks: conflicts are fields marked as passed that are failing', () => {
  const project = demoProject();
  const idx = fieldCheckIndex(project, [runDemo(1)]);
  assert.equal(trackerConflicts(project, idx).length, 0);
  project.mappings.find(m => m.sourceColumn === 'status').verification = { status: 'test_passed' };
  project.mappings.find(m => m.sourceColumn === 'vat_code').verification = { status: 'signed_off' };
  project.mappings.find(m => m.sourceColumn === 'payment_terms').verification = { status: 'signed_off' }; // passing: no conflict
  project.mappings.find(m => m.sourceColumn === 'supplier_name').verification = { status: 'test_uploaded' }; // failing but not claimed
  assert.deepEqual(trackerConflicts(project, idx).map(m => m.sourceColumn).sort(), ['status', 'vat_code']);
});

// ---------- plain-English guidance ----------
import { INTRO, STEP_GUIDE, SCREEN_GUIDE, GLOSSARY } from '../js/guide.js';
import { STEPS } from '../js/progress.js';

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

// Flesch-Kincaid grade: about 6 is the reading level of an eleven-year-old.
function readingGrade(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
  const words = text.split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w));
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

function allGuideText() {
  const steps = Object.values(STEP_GUIDE).flatMap(g => [g.what, ...g.todo, g.done]);
  const screens = Object.values(SCREEN_GUIDE).flat();
  return [INTRO, ...steps, ...screens, ...GLOSSARY.map(g => g[1])];
}

test('guide: every step and every screen has guidance', () => {
  for (const step of STEPS) {
    assert.ok(STEP_GUIDE[step.key], `step ${step.key}`);
    assert.ok(STEP_GUIDE[step.key].todo.length >= 2);
    for (const screen of step.screens) assert.ok(SCREEN_GUIDE[screen.key]?.length, `screen ${screen.key}`);
  }
  assert.ok(SCREEN_GUIDE.home.length);
});

test('guide: reads at about age eleven', () => {
  const text = allGuideText();
  const overall = readingGrade(text.join(' '));
  assert.ok(overall <= 6, `overall reading grade ${overall.toFixed(1)} is above 6`);
  for (const line of text) {
    const words = line.split(/\s+/).length;
    // very short lines give unreliable scores, so only longer ones are graded
    if (words >= 12) assert.ok(readingGrade(line) <= 8.5, `too hard (${readingGrade(line).toFixed(1)}): ${line}`);
    for (const sentence of line.split(/[.!?]+/).filter(s => s.trim())) {
      assert.ok(sentence.trim().split(/\s+/).length <= 22, `sentence too long: ${sentence.trim()}`);
    }
  }
});

test('guide: avoids specialist words', () => {
  const banned = /\b(schema|reconcil\w*|extract|metadata|mapping stamp|source|target|verif\w*|traceab\w*|migrat\w*|lookup|transform\w*)\b/i;
  for (const line of allGuideText()) assert.doesNotMatch(line, banned);
});

// ---------- supplier mapping template import ----------
import { readFileSync } from 'node:fs';
import { parseMappingTemplate, mergeSchema, questionRows, detectColumns } from '../js/template-import.js';

function exampleRows() {
  const text = readFileSync(new URL('../samples/mapping-template-example.csv', import.meta.url), 'utf8');
  return text.trim().split('\n').map(l => l.split(','));
}

test('template import: reads the new system fields, matches and work lists', () => {
  const p = parseMappingTemplate(exampleRows(), { targetSystem: 'New' });
  assert.deepEqual(p.stats, { tables: 2, fields: 9, described: 5, sourceTables: 2, sourceFields: 5, matched: 5, notUsed: 1, questions: 2, unmatched: 1, checked: 0, duplicates: 0 });
  assert.equal(p.sourceSchema.system, 'Legacy');
  assert.deepEqual(p.areas, ['Customer', 'Order']);
  const name = p.targetSchema.tables[0].columns[1];
  assert.deepEqual([name.name, name.type], ['full_name', 'character varying(120)']);
  assert.equal(p.targetSchema.tables[0].columns[2].values, 'Lookup code type 101');
  assert.deepEqual(p.mappings[0], { sourceTable: 'tblCustomer', sourceColumn: 'CUS_ID', targetTable: 'load_customer', targetColumn: 'load_id',
    transformNotes: '', lookupRule: '', defaultValue: '', serviceArea: 'Customer', needsReview: false });
  assert.equal(p.mappings.find(m => m.targetColumn === 'customer_load_id').serviceArea, 'Order');
  assert.deepEqual(p.notUsed.map(x => x.column), ['marketing_opt_in']);
  assert.deepEqual(p.questions.map(x => x.column).sort(), ['order_total', 'preferred_contact']);
  assert.deepEqual(p.unmatched.map(x => x.column), ['delivery_notes']);
  assert.equal(questionRows(p).length, 3);
});

test('template import: every field lands in exactly one outcome', () => {
  const p = parseMappingTemplate(exampleRows());
  const matched = new Set(p.mappings.map(m => m.targetColumn + m.targetTable));
  const questionOnly = p.questions.filter(q => !matched.has(q.column + q.table)).length;
  assert.equal(p.stats.matched + p.stats.notUsed + p.stats.unmatched + questionOnly, p.stats.fields);
});

test('template import: rejects other files and merges without overwriting', () => {
  assert.throws(() => parseMappingTemplate([['a', 'b'], ['1', '2']]), /does not look like a mapping template/);
  assert.equal(detectColumns(['Template', 'csv_name', 'column_name', 'SynergyTable', 'SynergyField']).sourceSystem, 'Synergy');
  const existing = { system: 'X', tables: [{ name: 'load_customer', columns: [{ name: 'load_id', type: 'kept' }] }] };
  const { schema, added } = mergeSchema(existing, parseMappingTemplate(exampleRows()).targetSchema);
  assert.equal(added, 8);
  assert.equal(schema.tables[0].columns[0].type, 'kept');
  assert.equal(schema.tables.length, 2);
});

test('progress: after a template import, unmatched fields keep mapping in progress', () => {
  const parsed = parseMappingTemplate(exampleRows(), { targetSystem: 'New' });
  const p = { name: 'P', sourceSystem: 'Legacy', targetSystem: 'New', sourceSchema: parsed.sourceSchema, targetSchema: parsed.targetSchema,
    mappings: parsed.mappings.map((m, i) => ({ id: `i${i}`, ...m })), templateImport: { notUsed: parsed.notUsed } };
  const step = projectProgress(p).steps[1];
  assert.equal(step.state, 'progress');
  assert.match(step.summary, /^5 fields mapped\. 3 fields in the new system have no match/);
  assert.equal(projectProgress(p).next.text, 'Match or rule out the 3 fields with no match yet');
});

// ---------- screenshot dictionary ----------
import {
  SHOT_TEXT, PROMPT, fitSize, dropDuplicates, missingKey, buildRequest, askAI, explainError,
  normaliseKind, parseScreenReply, reviewRows, screenshotSchema, shotSummary, screenName,
} from '../js/screenshot-dictionary.js';

// A canned reply in the shape the AI is asked for, wrapped the way models often wrap it.
const CANNED_REPLY = '```json\n' + JSON.stringify({
  screen: 'Supplier Details',
  fields: [
    { label: 'Supplier Name *', kind: 'text', options: [], required: true },
    { label: 'Date Opened:', kind: 'datetime', options: [], required: false },
    { label: 'Credit Limit', kind: 'currency' },
    { label: 'On Hold', kind: 'checkbox', required: 'true' },
    { label: 'Payment Terms', kind: 'dropdown', options: ['30 days', '60 days', '30 days', ''] },
    { label: 'Notes', kind: 'text', options: ['should be dropped'] },
    { label: 'supplier name', kind: 'text' },
    { label: '   ', kind: 'text' },
  ],
}) + '\n```';

function fakeFetch(reply, { status = 200, calls = [] } = {}) {
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => ({ choices: [{ message: { content: reply } }] }) };
  };
  fn.calls = calls;
  return fn;
}

const SETTINGS = { baseURL: 'https://ai.example/v1/', model: 'vision-model', apiKey: ' key-123 ' };

test('screenshots: shrink to a long edge of 1,500 and never enlarge', () => {
  assert.deepEqual(fitSize(3000, 2000), { width: 1500, height: 1000, scale: 0.5 });
  assert.deepEqual(fitSize(1200, 4000).height, 1500);
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600, scale: 1 });
});

test('screenshots: exact copies are sent once, including ones sent earlier', () => {
  const items = [{ hash: 'a', n: 1 }, { hash: 'b', n: 2 }, { hash: 'a', n: 3 }, { hash: 'c', n: 4 }];
  const { keep, duplicates } = dropDuplicates(items, new Set(['c']));
  assert.deepEqual(keep.map(i => i.n), [1, 2]);
  assert.deepEqual(duplicates.map(i => i.n), [3, 4]);
});

test('screenshots: no key means no call, with a plain message', async () => {
  assert.equal(missingKey({ apiKey: '  ' }), true);
  assert.equal(missingKey(SETTINGS), false);
  const calls = [];
  await assert.rejects(askAI('data:image/jpeg;base64,AAA', { ...SETTINGS, apiKey: '' }, fakeFetch('{}', { calls })), /no AI key yet/);
  assert.equal(calls.length, 0);
});

test('screenshots: the request uses the saved settings and asks for JSON only', async () => {
  const fetch = fakeFetch(CANNED_REPLY);
  const reply = await askAI('data:image/jpeg;base64,AAA', SETTINGS, fetch);
  assert.equal(reply, CANNED_REPLY);
  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://ai.example/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer key-123');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'vision-model');
  assert.equal(body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAA');
  assert.match(body.messages[1].content[0].text, /JSON only/);
  for (const word of ['label', 'kind', 'options', 'required', 'screen', 'pick-list', 'yes/no']) assert.ok(PROMPT.includes(word), word);
  assert.match(PROMPT, /Never copy the values/);
  assert.deepEqual(buildRequest('x', {}).model, 'gpt-4o-mini');
});

test('screenshots: service errors become plain reasons', async () => {
  await assert.rejects(askAI('x', SETTINGS, fakeFetch('', { status: 401 })), /did not accept your key/);
  await assert.rejects(askAI('x', SETTINGS, fakeFetch('', { status: 429 })), /busy or your account is out of credit/);
  await assert.rejects(askAI('x', SETTINGS, async () => { throw new TypeError('Failed to fetch'); }), /Could not reach/);
  await assert.rejects(askAI('x', SETTINGS, fakeFetch('')), /sent back nothing/);
  assert.match(explainError(503), /had a problem/);
});

test('screenshots: the reply is cleaned into labels, kinds, choices and required', () => {
  const r = parseScreenReply(CANNED_REPLY);
  assert.equal(r.screen, 'Supplier Details');
  assert.deepEqual(r.fields, [
    { label: 'Supplier Name', kind: 'text', options: [], required: true },
    { label: 'Date Opened', kind: 'date', options: [], required: false },
    { label: 'Credit Limit', kind: 'number', options: [], required: false },
    { label: 'On Hold', kind: 'yes/no', options: [], required: true },
    { label: 'Payment Terms', kind: 'pick-list', options: ['30 days', '60 days'], required: false },
    { label: 'Notes', kind: 'text', options: [], required: false },
  ]);
  assert.equal(normaliseKind('something odd'), 'text');
  assert.equal(normaliseKind('Pick list'), 'pick-list');
  assert.throws(() => parseScreenReply('Sorry, I cannot help with that.'), /not in the right form/);
  assert.throws(() => parseScreenReply('{"screen":"X"}'), /no list of fields/);
  assert.deepEqual(parseScreenReply('Here you go: {"screen":"","fields":[{"label":"Ref"}]} thanks').fields[0].label, 'Ref');
});

test('screenshots: nothing is added unless ticked, and fields are marked label only', () => {
  const results = [{ file: 'supplier.png', ...parseScreenReply(CANNED_REPLY) }, { file: 'Order screen.PNG', screen: '', fields: [{ label: 'Order Ref', kind: 'text', options: [], required: false }] }];
  const existing = { system: 'Old', tables: [{ name: 'Screen: Supplier Details', columns: [{ name: 'Notes', type: 'text' }] }] };
  const rows = reviewRows(results, existing);
  assert.equal(rows.length, 7);
  assert.ok(rows.every(r => r.ticked === false));
  assert.equal(rows.find(r => r.label === 'Notes').already, true);
  assert.equal(screenName(results[1]), 'Screen: Order screen');

  assert.deepEqual(screenshotSchema(rows).tables, []);

  rows.forEach(r => { r.ticked = !['Credit Limit'].includes(r.label); });
  rows.find(r => r.label === 'Date Opened').label = 'Date account opened';
  const schema = screenshotSchema(rows);
  assert.deepEqual(schema.tables.map(t => t.name), ['Screen: Supplier Details', 'Screen: Order screen']);
  const cols = schema.tables[0].columns;
  assert.deepEqual(cols.map(c => c.name), ['Supplier Name', 'Date account opened', 'On Hold', 'Payment Terms']);
  assert.ok(cols.every(c => c.origin === 'screenshot' && c.description === SHOT_TEXT.labelOnly));
  assert.match(SHOT_TEXT.labelOnly, /label only/);
  assert.equal(cols[3].values, '30 days, 60 days');
  assert.equal(cols[0].required, true);

  const merged = mergeSchema(existing, schema);
  assert.equal(merged.added, 5);
  assert.equal(merged.schema.tables[0].columns[0].name, 'Notes');
});

test('screenshots: only text is kept, never the picture', () => {
  const rows = reviewRows([{ file: 'a.png', ...parseScreenReply(CANNED_REPLY) }], null);
  rows.forEach(r => { r.ticked = true; });
  const stored = JSON.stringify(screenshotSchema(rows));
  assert.doesNotMatch(stored, /data:image|base64/);
});

test('screenshots: the summary says what was added, what is left and what to do next', () => {
  const s = shotSummary({ pictures: 3, duplicates: 1, failed: 1, found: 12, added: 9, already: 1, leftOut: 2, screens: 2 });
  assert.equal(s.title, 'Added 9 names from 2 screens to the old system list.');
  assert.deepEqual(s.detail, [
    'The AI read 3 pictures and found 12 names.',
    '2 names were not ticked, so they were left out.',
    '1 name was in the list already.',
    '1 picture was a copy, so it was not sent.',
    '1 picture could not be read. Try it again.',
  ]);
  assert.match(s.next, /Match screen/);
  assert.equal(shotSummary({ pictures: 1, duplicates: 0, failed: 0, found: 0, added: 0, already: 0, leftOut: 0, screens: 0 }).title, 'Nothing was added.');
});

test('screenshots: the words on screen read at about age eleven', () => {
  const summary = shotSummary({ pictures: 3, duplicates: 1, failed: 1, found: 12, added: 9, already: 1, leftOut: 2, screens: 2 });
  const text = [...Object.values(SHOT_TEXT), summary.title, ...summary.detail];
  const overall = readingGrade(text.join(' '));
  assert.ok(overall <= 6, `overall reading grade ${overall.toFixed(1)} is above 6`);
  const banned = /\b(schema|reconcil\w*|extract|metadata|source|target|verif\w*|migrat\w*|lookup|transform\w*|upload\w*|LLM|API)\b/i;
  for (const line of text) {
    assert.doesNotMatch(line, banned);
    if (line.split(/\s+/).length >= 12) assert.ok(readingGrade(line) <= 8.5, `too hard (${readingGrade(line).toFixed(1)}): ${line}`);
    for (const sentence of line.split(/[.!?]+/).filter(s => s.trim())) assert.ok(sentence.trim().split(/\s+/).length <= 22, `sentence too long: ${sentence.trim()}`);
  }
});
