// The problems log: every time UAT fails, in test or in live.
//
// Nothing new is stored. Each "failed" step in a field's history is a
// problem. What happened next in that history says where it has got:
// - a new load at the same stage means the fix is loaded and needs UAT again
// - failing again after that puts it back to open
// - a pass at the same stage means it is fixed
// - a pass in live, or sign-off, closes anything still open
// - going straight back to re-do the check means it was recorded by mistake
// So the log can never disagree with the field tracker. No AI.

import { projectOverview, NO_AREA } from './reconcile-overview.js';
import { areaFields } from './field-progress.js';

export const PROBLEM_STATUS = {
  open: 'Open',
  reloaded: 'Fix loaded, needs UAT again',
  fixed: 'Fixed',
  signed: 'Closed at sign-off',
  withdrawn: 'Taken back',
};

export const WHERE_LABEL = { test: 'Test', live: 'Live' };

export const PROBLEMS_TEXT = {
  title: 'Problems found in UAT',
  lead: 'Every time UAT fails, in test or in live, it is listed here. When the field passes again, its problem is marked fixed.',
  none: 'No problems yet. When you record that UAT failed, it shows up here.',
  noneOpen: 'Nothing is open. Every problem found so far has been fixed.',
  download: 'Download for the supplier',
  areaHeading: 'Open problems',
};

const FAIL = { test_failed: 'test', live_failed: 'live' };
const PASS = { test_passed: 'test', live_passed: 'live' };
const LOAD = { test_uploaded: 'test', live_uploaded: 'live' };
const CHECK_STEP = { test: 'test_checked', live: 'live_checked' };

/** The problems in one field's history, oldest first. */
export function fieldProblems(mapping) {
  const history = mapping?.verification?.history || [];
  const rounds = { test: 0, live: 0 };
  const problems = [];
  history.forEach((h, i) => {
    const where = FAIL[h.status];
    if (where && !h.revertTo) {
      // UAT failed again after a fix was loaded: the earlier problems are open again.
      problems.filter(p => p.where === where && p.status === 'reloaded').forEach(p => { p.status = 'open'; });
      rounds[where]++;
      problems.push({ where, round: rounds[where], note: h.note || '', reference: h.reference || '', by: (h.participants?.length ? h.participants.join(', ') : h.by) || '', at: h.at || '', status: 'open', closedBy: '', closedAt: '', index: i });
      return;
    }
    const open = problems.filter(p => p.status === 'open' || p.status === 'reloaded');
    if (!open.length) return;
    const close = (list, status) => list.forEach(p => { p.status = status; p.closedBy = h.by || ''; p.closedAt = h.at || ''; });
    // Straight back to the check that failed: it was recorded by mistake.
    const last = open.at(-1);
    if (h.revertTo && last.index === i - 1 && h.revertTo === CHECK_STEP[last.where]) {
      close([last], 'withdrawn');
      rounds[last.where]--;
      return;
    }
    if (h.status === 'signed_off') return close(open, 'signed');
    if (PASS[h.status] === 'live') return close(open, 'fixed');
    if (PASS[h.status]) return close(open.filter(p => p.where === PASS[h.status]), 'fixed');
    if (LOAD[h.status]) open.filter(p => p.where === LOAD[h.status] && p.status === 'open').forEach(p => { p.status = 'reloaded'; });
  });
  return problems.map(({ index, ...p }) => p);
}

export const isOpen = p => p.status === 'open' || p.status === 'reloaded';

/** Every problem in the move, with its field and area. Open ones first, newest first. */
export function projectProblems(project) {
  const ov = projectOverview(project, project.reconRuns || [], { finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [] });
  const areaOf = new Map();
  for (const a of ov.areas) for (const m of areaFields(project, a)) areaOf.set(m.id, a.name);
  const rows = [];
  for (const m of project.mappings || []) {
    for (const p of fieldProblems(m)) {
      rows.push({
        ...p,
        mappingId: m.id,
        area: areaOf.get(m.id) || NO_AREA,
        table: m.targetTable || '',
        field: m.targetColumn || '',
        from: [m.sourceTable, m.sourceColumn].filter(Boolean).join('.'),
      });
    }
  }
  return rows.sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || String(b.at).localeCompare(String(a.at)));
}

export function problemCounts(rows) {
  const open = rows.filter(isOpen);
  return {
    total: rows.filter(r => r.status !== 'withdrawn').length,
    open: open.length,
    openTest: open.filter(r => r.where === 'test').length,
    openLive: open.filter(r => r.where === 'live').length,
    fixed: rows.filter(r => r.status === 'fixed' || r.status === 'signed').length,
  };
}

/** Filter by { show: 'open'|'all', where: ''|'test'|'live', area: '' }. Taken-back rows only show under 'all'. */
export function filterProblems(rows, { show = 'open', where = '', area = '' } = {}) {
  return rows.filter(r => (show === 'all' || isOpen(r)) && (!where || r.where === where) && (!area || r.area === area));
}

const csvCell = v => {
  const s = String(v ?? '');
  // Stop spreadsheet apps treating a note as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function problemsCsv(rows, { oldName = 'Old system', newName = 'New system' } = {}) {
  const head = ['Area', `${newName} table`, `${newName} field`, `From ${oldName}`, 'Found in', 'Round', 'What went wrong', 'Supplier reference', 'Raised by', 'Raised on', 'Status', 'Closed by', 'Closed on'];
  const day = iso => (iso ? String(iso).slice(0, 10) : '');
  const body = rows.map(r => [r.area, r.table, r.field, r.from, WHERE_LABEL[r.where], r.round, r.note, r.reference, r.by, day(r.at), PROBLEM_STATUS[r.status], r.closedBy, day(r.closedAt)]);
  return [head, ...body].map(line => line.map(csvCell).join(',')).join('\r\n');
}
