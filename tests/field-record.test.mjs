import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retireMatch, retireMissing, recordNotMoving, withdrawDecision, currentDecision,
  unmatchedOldFields, decisionSummary, findFields, resultLine, RECORD_TEXT,
} from '../js/field-record.js';
import { reportData, reportHtml } from '../js/signoff-report.js';
import { buildExportPackage, evidenceFingerprint } from '../js/export.js';
import { defaultVerification, recordTransition } from '../js/verification.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

function project() {
  const m1 = { id: 'm1', sourceTable: 'supplier', sourceColumn: 'apar_name', targetTable: 'Supplier', targetColumn: 'Supplier name', lookupRule: '', defaultValue: '', transformNotes: 'Trim spaces', serviceArea: 'Finance', verification: defaultVerification('Match made', 'Alex') };
  const m2 = { id: 'm2', sourceTable: 'supplier', sourceColumn: 'vat_reg', targetTable: 'Supplier', targetColumn: 'Tax registration number', lookupRule: '', defaultValue: '', transformNotes: '', serviceArea: 'Finance', verification: defaultVerification('Match made', 'Fiona') };
  return {
    name: 'Finance move', sourceSystem: 'Agresso', targetSystem: 'Oracle',
    sourceSchema: { tables: [{ name: 'supplier', columns: [{ name: 'apar_name' }, { name: 'vat_reg' }, { name: 'fax_no' }, { name: 'old_flag' }] }] },
    targetSchema: { tables: [{ name: 'Supplier', columns: [{ name: 'Supplier name' }, { name: 'Tax registration number' }, { name: 'Alias' }] }] },
    mappings: [m1, m2],
  };
}

test('a removed match stays in the record with who, when and why', () => {
  const p = project();
  const gone = p.mappings[1];
  recordTransition(gone, { status: 'sql_sent', by: 'Fiona', note: 'Sent' });
  retireMatch(p, gone, { by: 'Alex', reason: 'Wrong field: this is the old VAT number', at: '2026-11-24T10:00:00Z' });
  p.mappings = p.mappings.filter(m => m.id !== gone.id);
  assert.equal(p.removedMatches.length, 1);
  const r = p.removedMatches[0];
  assert.deepEqual(r.removed, { at: '2026-11-24T10:00:00Z', by: 'Alex', reason: 'Wrong field: this is the old VAT number', kind: 'removed' });
  assert.deepEqual(r.verification.history.map(h => h.status), ['mapped', 'sql_sent', 'removed'], 'its whole history is kept');
  assert.equal(retireMatch(p, gone, { by: 'Alex', reason: 'again' }), null, 'a match is only kept once');
  assert.equal(gone.verification.history.length, 2, 'the live match is not changed');
});

test('a match replaced by a new one is kept, with the reason given for it', () => {
  const p = project();
  const before = [...p.mappings];
  const after = [p.mappings[0], { id: 'm3', sourceTable: 'supplier', sourceColumn: 'vat_reg', targetTable: 'Supplier', targetColumn: 'Alias' }];
  const kept = retireMissing(p, before, after, { by: 'Alex' });
  assert.equal(kept.length, 1);
  assert.equal(p.removedMatches[0].id, 'm2');
  assert.equal(p.removedMatches[0].removed.reason, RECORD_TEXT.replaced);
  assert.equal(p.removedMatches[0].removed.kind, 'replaced');
  assert.equal(retireMissing(p, after, after).length, 0);
});

test('old fields with no match can be recorded as not moving, and changing your mind keeps both', () => {
  const p = project();
  assert.deepEqual(unmatchedOldFields(p).map(f => f.column), ['fax_no', 'old_flag']);
  assert.throws(() => recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: '  ', by: 'Alex' }), /Enter a reason/);
  recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: 'No longer used since 2019', by: 'Alex' });
  assert.equal(currentDecision(p, 'supplier', 'fax_no').reason, 'No longer used since 2019');
  assert.deepEqual(decisionSummary(p), { unmatched: 2, decided: 1, undecided: 1 });
  withdrawDecision(p, { table: 'supplier', column: 'fax_no', by: 'Fiona' });
  assert.equal(currentDecision(p, 'supplier', 'fax_no'), null);
  assert.deepEqual(p.fieldDecisions.map(d => d.decision), ['not_moving', 'withdrawn'], 'nothing is erased');
  assert.deepEqual(decisionSummary(p), { unmatched: 2, decided: 0, undecided: 2 });
});

test('find a field says where it went and why, for every kind of answer', () => {
  const p = project();
  recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: 'No longer used', by: 'Alex' });
  retireMatch(p, p.mappings[1], { by: 'Alex', reason: 'Wrong field' });
  p.mappings = [p.mappings[0]];
  const name = findFields(p, 'apar');
  assert.equal(name.length, 1);
  assert.equal(name[0].state, 'matched');
  assert.match(resultLine(name[0]), /Goes to Supplier\.Supplier name\. Matched\. Note: Trim spaces\./);
  assert.equal(findFields(p, 'fax')[0].state, 'not_moving');
  assert.equal(resultLine(findFields(p, 'fax')[0]), 'Not moving: No longer used');
  const vat = findFields(p, 'vat_reg')[0];
  assert.equal(vat.state, 'undecided');
  assert.equal(vat.removed[0].reason, 'Wrong field');
  const alias = findFields(p, 'alias')[0];
  assert.equal(alias.side, 'new');
  assert.equal(alias.state, 'unmatched');
  assert.equal(findFields(p, 'supplier name')[0].state, 'matched', 'new fields too');
  assert.deepEqual(findFields(p, 'a'), [], 'needs at least two letters');
});

test('the sign-off report covers every field and says when it is not complete', () => {
  const p = project();
  recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: 'No longer used', by: 'Alex' });
  retireMatch(p, p.mappings[1], { by: 'Alex', reason: 'Wrong field' });
  p.mappings = [p.mappings[0]];
  const d = reportData(p);
  assert.equal(d.counts.matches, 1);
  assert.equal(d.counts.notMoving, 1);
  assert.equal(d.counts.removed, 1);
  assert.deepEqual(d.undecided, ['supplier.vat_reg', 'supplier.old_flag'], 'in field list order');
  assert.ok(d.gaps.some(g => /2 old fields have no match and no decision/.test(g)));
  const html = reportHtml(d, { esc, fingerprint: 'abc123' });
  assert.match(html, /This report is not complete yet/);
  assert.match(html, /No longer used/);
  assert.match(html, /Wrong field/);
  assert.match(html, /abc123/);
  assert.match(html, /Signature/);
});

test('the report says every field is accounted for only when it is', () => {
  const p = project();
  recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: 'Unused', by: 'Alex' });
  recordNotMoving(p, { table: 'supplier', column: 'old_flag', reason: 'Unused', by: 'Alex' });
  for (const m of p.mappings) recordTransition(m, { status: 'signed_off', by: 'Sarah' });
  const d = reportData(p);
  assert.deepEqual(d.gaps, []);
  assert.match(reportHtml(d, { esc }), /Every field is accounted for/);
});

test('the evidence pack holds removals and decisions, and its fingerprint changes when it is edited', async () => {
  const p = project();
  recordNotMoving(p, { table: 'supplier', column: 'fax_no', reason: 'Unused', by: 'Alex' });
  retireMatch(p, p.mappings[1], { by: 'Alex', reason: 'Wrong field' });
  const pkg = buildExportPackage(p, { email: 'a@b.c' });
  assert.equal(pkg.removedMatches.length, 1);
  assert.equal(pkg.removedMatches[0].removed.reason, 'Wrong field');
  assert.equal(pkg.fieldDecisions.length, 1);
  const fp = await evidenceFingerprint(pkg);
  assert.match(fp, /^[0-9a-f]{64}$/);
  assert.equal(await evidenceFingerprint({ ...pkg, exportedAt: 'later', exportedBy: 'someone else', fingerprint: fp }), fp, 'who and when do not change it');
  const edited = JSON.parse(JSON.stringify(pkg));
  edited.fieldDecisions[0].reason = 'Changed afterwards';
  assert.notEqual(await evidenceFingerprint(edited), fp);
});
