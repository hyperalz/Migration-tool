// One record of progress. Every field has one stage, worked out from two
// kinds of evidence:
//   - what people record in the field tracker (SQL sent, in test, checked
//     in the new system's own screens, passed or failed);
//   - what file checks found (Check a load).
// A failure from either counts as failed, so the two can never tell
// different stories. Fields add up to their table and their area.
// No AI anywhere in this: it only reads what was recorded and checked.

import { fieldCheckIndex } from './field-checks.js';
import { tablePairs } from './reconcile.js';
import { recordTransition } from './verification.js';

export const FIELD_STAGES = ['matched', 'sent', 'testing', 'failed', 'passed', 'signed'];

const FROM_STATUS = {
  mapped: 'matched',
  sql_sent: 'sent',
  test_uploaded: 'testing',
  live_uploaded: 'testing',
  test_failed: 'failed',
  live_failed: 'failed',
  test_passed: 'passed',
  live_passed: 'passed',
  signed_off: 'signed',
};
const ORDER = { matched: 0, sent: 1, testing: 2, failed: 3, passed: 4, signed: 5 };

/**
 * The stage of one field.
 * @param {object} mapping
 * @param {{state:string}|undefined} check  this field's entry from fieldCheckIndex
 */
export function fieldStage(mapping, check) {
  const tracked = FROM_STATUS[mapping?.verification?.status] || 'matched';
  if (check?.state === 'fail') return 'failed';               // a problem found by a file check
  if (check?.state === 'recheck' && ORDER[tracked] >= ORDER.passed) return 'testing'; // matches changed since
  if (check?.state === 'pass' && ORDER[tracked] < ORDER.passed && tracked !== 'failed') return 'passed';
  return tracked;
}

/** Every field's stage, keyed by match id. */
export function fieldStages(project) {
  const index = fieldCheckIndex(project, project?.reconRuns || [], { finalRunId: project?.reconFinalRunId || null });
  return new Map((project?.mappings || []).map(m => [m.id, fieldStage(m, index.get(m.id))]));
}

/** Counts of each stage for a set of fields. */
export function stageCounts(mappings, stages) {
  const c = Object.fromEntries(FIELD_STAGES.map(s => [s, 0]));
  for (const m of mappings) c[stages.get(m.id) || 'matched']++;
  c.total = mappings.length;
  c.done = c.passed + c.signed;
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
