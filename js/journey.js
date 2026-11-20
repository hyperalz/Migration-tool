// Moving the data: once fields are matched, each table goes through the
// same steps. Send the agreed matches to whoever does the load, then for the
// test copy of the new system and again for live: the data is loaded, its
// files are checked, and people test it on screen. This works out where each
// table is, and the one thing to do next for it. Pure functions, so they can
// be tested; the field tracker holds the same statuses field by field.

import { tablePairs } from './reconcile.js';
import { recordTransition } from './verification.js';
import { tableNoun } from './reconcile-plain.js';

export const JOURNEY_TEXT = {
  title: 'Move the data: test first, then live',
  lead: 'Your fields are matched. Now whoever does the load copies the data across: first into a test copy of the new system, then into live. At each stage you check the data arrived correctly, and people test it on screen. MapBridge never moves any data itself.',
  boardTitle: 'Where each table is',
  steps: [
    { key: 'send', title: '1. Send', text: 'Give the agreed matches to whoever does the load.' },
    { key: 'test', title: '2. Test load', text: 'They load a test copy. You check the files, and people test it on screen.' },
    { key: 'live', title: '3. Live load', text: 'The same again for the real system. This is the load you sign off.' },
  ],
  checkTitle: 'Check a load',
  checkLead: 'Add one file from each system for the tables in this load. MapBridge compares every record, every total and every matched field.',
  whichLoad: 'Which load is this?',
};

export const NEXT = {
  send: 'Send the matches to whoever does the load',
  markTest: 'Waiting for the test load',
  checkTest: 'Check the test load',
  fixTest: 'Fix the problems, then load into test again',
  uatTest: 'People test it on screen in test',
  markLive: 'Waiting for the live load',
  checkLive: 'Check the live load',
  fixLive: 'Fix the problems, then load into live again',
  uatLive: 'People test it on screen in live',
  done: 'Ready to sign off',
};

// How far along each tracker status is.
const RANK = { mapped: 0, sql_sent: 1, test_uploaded: 2, test_failed: 2, test_passed: 3, live_uploaded: 4, live_failed: 4, live_passed: 5, signed_off: 6 };
const rank = m => RANK[m.verification?.status || 'mapped'] ?? 0;
const status = m => m.verification?.status || 'mapped';

/** Older checks have no stage: they were test loads. */
export function runStage(run) {
  return run?.stage === 'live' ? 'live' : 'test';
}

function lastDate(mappings, statuses) {
  let at = null;
  for (const m of mappings) for (const h of m.verification?.history || []) {
    if (statuses.includes(h.status) && (!at || h.at > at)) at = h.at;
  }
  return at;
}

function latestCheck(runs, pairId, stage) {
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (runStage(r) !== stage) continue;
    const p = (r.pairs || []).find(x => x.id === pairId);
    if (!p) continue;
    const serious = (p.groups || []).filter(g => g.severity === 'high').length;
    const other = (p.groups || []).length - serious;
    return { runId: r.id, label: r.label, at: r.at, serious, other };
  }
  return null;
}

/** Each table pair with where it stands at each stage, and what to do next. */
export function tableJourney(project) {
  const runs = project?.reconRuns || [];
  return tablePairs(project?.mappings || []).map(pair => {
    const ms = pair.mappings;
    const total = ms.length;
    const n = test => ms.filter(test).length;
    const send = { done: n(m => rank(m) >= 1), at: lastDate(ms, ['sql_sent']) };
    const test = {
      loaded: n(m => rank(m) >= 2), at: lastDate(ms, ['test_uploaded']),
      passed: n(m => rank(m) >= 3), failed: n(m => status(m) === 'test_failed'), waiting: n(m => status(m) === 'test_uploaded'),
      check: latestCheck(runs, pair.id, 'test'),
    };
    const live = {
      loaded: n(m => rank(m) >= 4), at: lastDate(ms, ['live_uploaded']),
      passed: n(m => rank(m) >= 5), failed: n(m => status(m) === 'live_failed'), waiting: n(m => status(m) === 'live_uploaded'),
      check: latestCheck(runs, pair.id, 'live'),
    };
    // People's testing recorded in the field tracker counts as much as a file check.
    const testTested = test.passed + test.failed > 0;
    const liveTested = live.passed + live.failed > 0;
    let next;
    if (send.done < total) next = 'send';
    else if (test.loaded < total) next = 'markTest';
    else if (test.check?.serious) next = 'fixTest';
    else if (!test.check && !testTested) next = 'checkTest';
    else if (test.failed || test.waiting) next = test.failed ? 'fixTest' : 'uatTest';
    else if (live.loaded < total) next = 'markLive';
    else if (live.check?.serious) next = 'fixLive';
    else if (!live.check && !liveTested) next = 'checkLive';
    else if (live.failed || live.waiting) next = live.failed ? 'fixLive' : 'uatLive';
    else next = 'done';
    return {
      id: pair.id, pair, name: tableNoun(pair.targetTable), sourceTable: pair.sourceTable, targetTable: pair.targetTable,
      total, send, test, live, next, nextText: NEXT[next],
    };
  });
}

/** Which load a new check is most likely for. */
export function suggestedStage(rows) {
  return rows.some(r => ['markLive', 'checkLive', 'fixLive', 'uatLive'].includes(r.next)) && !rows.some(r => ['checkTest', 'fixTest'].includes(r.next)) ? 'live' : 'test';
}

/**
 * Move every field in a table on to the next status, recording who and when,
 * the same as doing it field by field in the tracker.
 */
export const BULK = {
  send: { from: ['mapped', 'test_failed'], to: 'sql_sent', note: 'Matches sent to whoever does the load' },
  markTest: { from: ['sql_sent'], to: 'test_uploaded', note: 'Loaded into test' },
  markLive: { from: ['test_passed', 'live_failed'], to: 'live_uploaded', note: 'Loaded into live' },
};

export function bulkMark(mappings, action, by) {
  const rule = BULK[action];
  if (!rule) return 0;
  let moved = 0;
  for (const m of mappings) {
    if (!rule.from.includes(status(m))) continue;
    recordTransition(m, { status: rule.to, by, note: rule.note });
    moved++;
  }
  return moved;
}

/** The agreed matches for one table, as rows for whoever does the load. */
export function supplierRows(pair) {
  return pair.mappings.map(m => ({
    old_table: m.sourceTable, old_field: m.sourceColumn,
    new_table: m.targetTable, new_field: m.targetColumn,
    translation: m.lookupRule || '', default_value: m.defaultValue || '', notes: m.transformNotes || '',
  }));
}

/**
 * What to ask for after a load: for each table, the fields to export from
 * each system, and which ones identify a record.
 */
export function fileRequestRows(rows, keyIdsFor = () => []) {
  const out = [];
  for (const r of rows) {
    const keys = new Set(keyIdsFor(r.pair));
    for (const m of r.pair.mappings) {
      out.push({ table: r.name, system: 'old', file_table: m.sourceTable, field: m.sourceColumn, identifies_a_record: keys.has(m.id) ? 'yes' : '' });
    }
    for (const m of r.pair.mappings) {
      out.push({ table: r.name, system: 'new', file_table: m.targetTable, field: m.targetColumn, identifies_a_record: keys.has(m.id) ? 'yes' : '' });
    }
  }
  return out;
}

export function fileRequestText(rows, { oldName = 'the old system', newName = 'the new system', stage = 'test', keyIdsFor = () => [] } = {}) {
  const where = stage === 'live' ? 'live' : 'test';
  const lines = [
    `Please send two CSV files for each table below, taken after the ${where} load: one exported from ${oldName}, and one exported from what is now in ${newName}.`,
    'Each file needs a heading row, and the fields listed. The fields marked * identify each record, so please include them.',
    '',
  ];
  for (const r of rows) {
    const keys = new Set(keyIdsFor(r.pair));
    lines.push(`${r.name}`);
    lines.push(`  From ${oldName} (${r.sourceTable}): ${r.pair.mappings.map(m => m.sourceColumn + (keys.has(m.id) ? '*' : '')).join(', ')}`);
    lines.push(`  From ${newName} (${r.targetTable}): ${r.pair.mappings.map(m => m.targetColumn + (keys.has(m.id) ? '*' : '')).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
