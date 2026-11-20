import test from 'node:test';
import assert from 'node:assert/strict';
import { tableJourney, bulkMark, supplierRows, fileRequestText, fileRequestRows, runStage, suggestedStage } from '../js/journey.js';

const m = (id, src, tgt, status = 'mapped') => ({ id, sourceTable: 'old_sup', sourceColumn: src, targetTable: 'Supplier', targetColumn: tgt, verification: { status, history: [] } });
const project = (mappings, reconRuns = []) => ({ mappings, reconRuns });

test('a newly matched table needs sending first', () => {
  const [r] = tableJourney(project([m('a', 'id', 'Id'), m('b', 'nm', 'Name')]));
  assert.equal(r.next, 'send');
  assert.equal(r.total, 2);
  assert.equal(r.send.done, 0);
});

test('marking sent then loaded moves the table on, field by field in the history', () => {
  const ms = [m('a', 'id', 'Id'), m('b', 'nm', 'Name')];
  assert.equal(bulkMark(ms, 'send', 'Alex'), 2);
  assert.equal(tableJourney(project(ms))[0].next, 'markTest');
  assert.equal(bulkMark(ms, 'markTest', 'Alex'), 2);
  assert.equal(ms[0].verification.history.at(-1).note, 'Supplier copied the data into test');
  assert.equal(tableJourney(project(ms))[0].next, 'checkTest');
  // Nothing to move live yet: nothing has passed test.
  assert.equal(bulkMark(ms, 'markLive', 'Alex'), 0);
});

test('a test check with serious problems asks for a fix; a clean one asks for people to test', () => {
  const ms = [m('a', 'id', 'Id', 'test_uploaded')];
  const run = (id, groups, stage) => ({ id, label: id, at: '2026-11-01', stage, pairs: [{ id: 'old_sup→Supplier', groups }] });
  assert.equal(tableJourney(project(ms, [run('r1', [{ severity: 'high' }])]))[0].next, 'fixTest');
  assert.equal(tableJourney(project(ms, [run('r1', [{ severity: 'high' }]), run('r2', [{ severity: 'low' }])]))[0].next, 'uatTest');
  // A live check does not count for test.
  assert.equal(tableJourney(project(ms, [run('r3', [], 'live')]))[0].next, 'checkTest');
});

test('passing test leads to the live load, then sign off', () => {
  const ms = [m('a', 'id', 'Id', 'test_passed')];
  assert.equal(tableJourney(project(ms))[0].next, 'markLive');
  bulkMark(ms, 'markLive', 'Alex');
  assert.equal(tableJourney(project(ms))[0].next, 'checkLive');
  ms[0].verification.status = 'live_passed';
  assert.equal(tableJourney(project(ms))[0].next, 'done');
  ms[0].verification.status = 'live_failed';
  assert.equal(tableJourney(project(ms))[0].next, 'fixLive');
});

test('older checks without a stage count as test loads', () => {
  assert.equal(runStage({}), 'test');
  assert.equal(runStage({ stage: 'live' }), 'live');
});

test('the suggested load follows where the tables are', () => {
  assert.equal(suggestedStage([{ next: 'checkTest' }, { next: 'checkLive' }]), 'test');
  assert.equal(suggestedStage([{ next: 'checkLive' }, { next: 'done' }]), 'live');
});

test('supplier rows and the file request list every matched field', () => {
  const ms = [m('a', 'id', 'Id'), m('b', 'nm', 'Name')];
  const rows = tableJourney(project(ms));
  assert.deepEqual(supplierRows(rows[0].pair).map(r => r.new_field), ['Id', 'Name']);
  const text = fileRequestText(rows, { oldName: 'Old', newName: 'New', keyIdsFor: () => ['a'] });
  assert.match(text, /From Old \(old_sup\): id\*, nm/);
  assert.match(text, /copied into test/);
  const list = fileRequestRows(rows, () => ['a']);
  assert.equal(list.length, 4);
  assert.equal(list.filter(r => r.identifies_a_record === 'yes').length, 2);
});
