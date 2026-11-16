// Connects the field tracker to the load checks: for every mapped field, what
// did the most recent check of its table find?
//
// Uses the same basis as the project overview: each table's latest check, or
// the final load once one has been chosen.

import { tablePairs, mappingStamp, SEVERITY_ORDER } from './reconcile.js';

// Tracker statuses that claim the field has passed testing.
export const PASSED_STATUSES = ['test_passed', 'live_uploaded', 'live_passed', 'signed_off'];

export const CHECK_LABEL = {
  pass: 'Matches',
  fail: 'Differences found',
  recheck: 'Needs re-checking',
  not_checked: 'Not checked',
};

/**
 * @returns {Map<string, object>} mapping id -> {
 *   state: 'pass' | 'fail' | 'recheck' | 'not_checked',
 *   run: { id, label, at } | null,
 *   compared, mismatched,
 *   findings: [{ severity, title, count }],   differences in this field
 *   tableFindings: [{ severity, title, count }], whole-record problems in its table
 *   reason: string   why it is not checked / needs re-checking
 * }
 */
export function fieldCheckIndex(project, runs = [], { finalRunId = null } = {}) {
  const index = new Map();
  const finalRun = finalRunId ? runs.find(r => r.id === finalRunId) || null : null;

  for (const pair of tablePairs(project.mappings || [])) {
    const history = runs.filter(r => r.pairs.some(p => p.id === pair.id));
    const run = finalRun
      ? (finalRun.pairs.some(p => p.id === pair.id) ? finalRun : null)
      : history[history.length - 1] || null;
    const result = run ? run.pairs.find(p => p.id === pair.id) : null;

    if (!result) {
      const reason = finalRun ? 'This table was not in the final load' : 'No load has been checked for this table';
      for (const m of pair.mappings) {
        index.set(m.id, { state: 'not_checked', run: null, compared: 0, mismatched: 0, findings: [], tableFindings: [], reason });
      }
      continue;
    }

    const runInfo = { id: run.id, label: run.label, at: run.at };
    const changed = Boolean(result.mappingStamp) && result.mappingStamp !== mappingStamp(pair);
    const bySeverity = (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count;
    const tableFindings = result.groups
      .filter(g => g.field === '(whole record)')
      .map(g => ({ severity: g.severity, title: g.title, count: g.count }))
      .sort(bySeverity);

    for (const m of pair.mappings) {
      const f = result.fields.find(x => x.mappingId === m.id);
      // Group signatures are "<pair id>::<mapping id>::<kind>…"
      const prefix = `${pair.id}::${m.id}::`;
      const findings = result.groups
        .filter(g => g.signature.startsWith(prefix))
        .map(g => ({ severity: g.severity, title: g.title, count: g.count, kind: g.kind }))
        .sort(bySeverity);

      let state;
      let reason = '';
      if (!f) {
        state = 'not_checked';
        reason = 'This field was matched after the last check';
      } else if (f.skipped) {
        state = 'not_checked';
        reason = f.skipped;
      } else if (changed) {
        state = 'recheck';
        reason = 'The matches for this table changed after the last check';
      } else if (f.mismatched > 0 || findings.length) {
        state = 'fail';
      } else {
        state = 'pass';
      }

      index.set(m.id, {
        state, run: runInfo, reason,
        compared: f?.compared || 0, mismatched: f?.mismatched || 0,
        findings, tableFindings,
      });
    }
  }
  return index;
}

// Fields the tracker says have passed, while their latest check found differences.
export function trackerConflicts(project, index) {
  return (project.mappings || []).filter(m =>
    PASSED_STATUSES.includes(m.verification?.status) && index.get(m.id)?.state === 'fail');
}

// One line for the audit trail when a step is recorded.
export function checkNote(check) {
  if (!check || !check.run) return '';
  if (check.state === 'pass') return `Latest load check matched (${check.run.label}).`;
  if (check.state === 'fail') return `Latest load check found differences (${check.run.label}).`;
  if (check.state === 'recheck') return `Latest load check (${check.run.label}) is out of date: the matches changed since.`;
  return '';
}
