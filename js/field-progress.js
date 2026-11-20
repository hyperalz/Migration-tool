// One record of progress. Every field has one stage, worked out from two
// kinds of evidence:
//   - what people record in the field tracker (SQL sent, in test, checked
//     in the new system's own screens, passed or failed);
//   - what file checks found (Compare files).
// A failure from either counts as failed, so the two can never tell
// different stories. Fields add up to their table and their area.
// No AI anywhere in this: it only reads what was recorded and checked.

import { fieldCheckIndex } from './field-checks.js';
import { tablePairs } from './reconcile.js';
import { recordTransition } from './verification.js';

// Data goes into the test system first, then into live. Each has its own
// UAT, and a field only counts as done once UAT in live has passed.
export const FIELD_STAGES = ['matched', 'sent', 'inTest', 'testFailed', 'testPassed', 'inLive', 'liveFailed', 'livePassed', 'signed'];

const FROM_STATUS = {
  mapped: 'matched',
  sql_sent: 'sent',
  test_uploaded: 'inTest',
  test_failed: 'testFailed',
  test_passed: 'testPassed',
  live_uploaded: 'inLive',
  live_failed: 'liveFailed',
  live_passed: 'livePassed',
  signed_off: 'signed',
};
const ORDER = Object.fromEntries(FIELD_STAGES.map((s, i) => [s, i]));
const IN_LIVE = new Set(['inLive', 'liveFailed', 'livePassed', 'signed']);
const PASSED = new Set(['testPassed', 'livePassed', 'signed']);

/**
 * The stage of one field.
 * @param {object} mapping
 * @param {{state:string}|undefined} check  this field's entry from fieldCheckIndex
 */
export function fieldStage(mapping, check) {
  const tracked = FROM_STATUS[mapping?.verification?.status] || 'matched';
  const live = IN_LIVE.has(tracked);
  // A problem found by a file check fails the field where it now is.
  if (check?.state === 'fail') return live ? 'liveFailed' : 'testFailed';
  // Matches changed since a pass: it needs checking again.
  if (check?.state === 'recheck' && PASSED.has(tracked)) return live ? 'inLive' : 'inTest';
  // A file check that passes counts as passing test, unless a failure was recorded.
  if (check?.state === 'pass' && ORDER[tracked] < ORDER.testPassed && tracked !== 'testFailed') return 'testPassed';
  return tracked;
}

/** Every field's stage, keyed by match id. */
export function fieldStages(project) {
  const index = fieldCheckIndex(project, project?.reconRuns || [], { finalRunId: project?.reconFinalRunId || null });
  return new Map((project?.mappings || []).map(m => [m.id, fieldStage(m, index.get(m.id))]));
}

/** Counts of each stage for a set of fields, plus the totals people ask about. */
export function stageCounts(mappings, stages) {
  const c = Object.fromEntries(FIELD_STAGES.map(s => [s, 0]));
  for (const m of mappings) c[stages.get(m.id) || 'matched']++;
  c.total = mappings.length;
  c.failed = c.testFailed + c.liveFailed;
  c.waiting = c.inTest + c.inLive;                          // loaded, not checked yet
  c.passedTest = c.testPassed + c.inLive + c.liveFailed + c.livePassed + c.signed;
  c.reachedLive = c.inLive + c.liveFailed + c.livePassed + c.signed;
  c.done = c.livePassed + c.signed;                         // correct in live
  return c;
}

/**
 * The fields that belong to an area, as the overview groups them: by table,
 * each table in the area most of its matches carry.
 */
export function areaFields(project, overviewArea) {
  const ids = new Set(overviewArea.tables.map(t => t.id));
  return tablePairs(project.mappings || []).filter(p => ids.has(p.id)).flatMap(p => p.mappings);
}

/**
 * One sign-off for the whole area: every field in it is marked signed off,
 * with who signed and when in its history. Returns how many changed.
 */
export function signOffAreaFields(project, overviewArea, { by, at = new Date().toISOString() }) {
  const ids = new Set(areaFields(project, overviewArea).map(m => m.id));
  let changed = 0;
  for (const m of project.mappings || []) {
    if (!ids.has(m.id) || m.verification?.status === 'signed_off') continue;
    recordTransition(m, { status: 'signed_off', by, note: `Signed off with the ${overviewArea.name} area` });
    m.verification.history[m.verification.history.length - 1].at = at;
    changed++;
  }
  return changed;
}
