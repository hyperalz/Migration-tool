// A move is not a straight line. Different areas reach different stages,
// late news sends one area back, and a fix means checking again. This file
// shows that honestly:
//   areaBoard(): for each area, how far each stage has got.
//   todoList():  every open job, across all steps and areas, in one list,
//                with the jobs that hold other work up first.
// Everything is worked out from the project's own data. No AI, and nothing
// here decides a result: it only reads what the checks and lists say.

import { projectOverview, NO_AREA } from './reconcile-overview.js';
import { fieldCheckIndex, trackerConflicts } from './field-checks.js';
import { buildExportPackage, evidenceDigest } from './export.js';
import { SEARCHABLE, screenTables } from './trace.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const key = (t, c) => `${t}␟${c}`;

export const STAGES = [
  { key: 'list', label: 'List' },
  { key: 'match', label: 'Match' },
  { key: 'check', label: 'Check' },
  { key: 'agree', label: 'Agree' },
];

// The area of each new-system table: the area it was given in the supplier's
// spreadsheet, or else the area most of its matches carry.
function targetAreas(project) {
  const byTable = new Map();
  for (const m of project.mappings || []) {
    const a = (m.serviceArea || '').trim();
    if (!a) continue;
    const tally = byTable.get(m.targetTable) || new Map();
    tally.set(a, (tally.get(a) || 0) + 1);
    byTable.set(m.targetTable, tally);
  }
  const out = new Map();
  for (const t of project.targetSchema?.tables || []) {
    let area = (t.section || '').trim();
    if (!area) {
      let best = 0;
      for (const [a, n] of byTable.get(t.name) || []) if (n > best) { best = n; area = a; }
    }
    out.set(t.name, area || NO_AREA);
  }
  return out;
}

function areaNamesOf(project, tAreas, overview) {
  const names = new Set();
  for (const a of project.serviceAreas || []) names.add(typeof a === 'string' ? a : a.name);
  for (const a of tAreas.values()) names.add(a);
  for (const a of overview.areas) names.add(a.name);
  const list = [...names].filter(Boolean);
  // "No area set" only shows if something is actually in it.
  return list.sort((a, b) => (a === NO_AREA) - (b === NO_AREA) || a.localeCompare(b));
}

/**
 * For each area, what is done and what is left at each stage.
 * Cells: { state: 'done'|'open'|'none', text }
 */
export function areaBoard(project, overview = null) {
  const ov = overview || projectOverview(project, project.reconRuns || [], {
    finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [],
  });
  const tAreas = targetAreas(project);
  const mapped = new Set((project.mappings || []).map(m => key(m.targetTable, m.targetColumn)));
  const ruledOut = new Set((project.templateImport?.notUsed || []).map(x => key(x.table, x.column)));

  const rows = areaNamesOf(project, tAreas, ov).map(name => {
    const tables = (project.targetSchema?.tables || []).filter(t => tAreas.get(t.name) === name);
    const fields = tables.flatMap(t => (t.columns || []).map(c => ({ t: t.name, c })));
    const open = fields.filter(f => !mapped.has(key(f.t, f.c.name)) && !ruledOut.has(key(f.t, f.c.name)));
    const mustHave = open.filter(f => f.c.required === true).length;
    const area = ov.areas.find(a => a.name === name) || null;
    const checked = area ? area.tables.filter(t => t.state !== 'not_checked') : [];
    const toCheck = area ? area.tables.filter(t => t.state !== 'checked').length : 0;

    const list = fields.length ? { state: 'done', text: `${num(fields.length)} ${plural(fields.length, 'field')}` }
      : { state: 'open', text: 'Not in yet' };
    const match = !fields.length ? { state: 'none', text: '—' }
      : open.length ? { state: 'open', text: `${num(open.length)} to match${mustHave ? `, ${num(mustHave)} must` : ''}` }
        : { state: 'done', text: 'All matched' };
    let check;
    if (!area) check = { state: 'none', text: '—' };
    else if (area.issues.high) check = { state: 'open', text: `${num(area.issues.high)} serious ${plural(area.issues.high, 'problem')}` };
    else if (toCheck) check = { state: 'open', text: `${num(toCheck)} ${plural(toCheck, 'table')} to check` };
    else if (area.issues.other) check = { state: 'open', text: `${num(area.issues.other)} small ${plural(area.issues.other, 'problem')}` };
    else check = { state: 'done', text: 'All clear' };
    const agree = area?.signedOff ? { state: 'done', text: `Signed by ${area.signoff.name}` }
      : area && area.status === 'clear' ? { state: 'open', text: 'Ready to sign' }
        : { state: 'none', text: '—' };

    // Where the area is now: the first stage that is not done.
    const cells = { list, match, check, agree };
    const now = STAGES.find(s => cells[s.key].state !== 'done')?.key || 'done';
    return { name, cells, now, counts: { fields: fields.length, open: open.length, mustHave, toCheck, checked: checked.length } };
  });
  return rows.filter(r => r.name !== NO_AREA || r.counts.fields || r.cells.check.state !== 'none');
}

// The order jobs are listed in. Lower comes first: it holds up more.
const TIER = {
  lists: 1, areaList: 2, mustHave: 3, serious: 4, conflicts: 5, recheck: 6,
  match: 7, unchecked: 8, questions: 9, screens: 10, sign: 11, final: 12, evidence: 13,
};

/**
 * Every open job in one list, most important first.
 * @returns {{id, tier, area, text, path, step}[]}
 */
export function todoList(project) {
  const runs = project.reconRuns || [];
  const ov = projectOverview(project, runs, { finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [] });
  const board = areaBoard(project, ov);
  const items = [];
  const add = (id, tier, text, path, step, area = '') => items.push({ id, tier, text, path, step, area });
  const inArea = name => (name && name !== NO_AREA ? name : '');

  const oldFields = (project.sourceSchema?.tables || []).reduce((n, t) => n + (t.columns?.length || 0), 0);
  const newFields = (project.targetSchema?.tables || []).reduce((n, t) => n + (t.columns?.length || 0), 0);
  if (!oldFields) add('old-list', TIER.lists, 'Add the list of fields in the old system.', 'setup', 'setup');
  if (!newFields) add('new-list', TIER.lists, 'Add the list of fields in the new system.', 'setup', 'setup');

  for (const r of board) {
    const a = ov.areas.find(x => x.name === r.name);
    const where = inArea(r.name);
    if (newFields && !r.counts.fields && where) add(`list-${r.name}`, TIER.areaList, 'No fields for this area yet. Add them to the new system list.', 'setup', 'setup', where);
    if (r.counts.mustHave) add(`must-${r.name}`, TIER.mustHave, `${num(r.counts.mustHave)} ${plural(r.counts.mustHave, 'field')} the new system must have ${plural(r.counts.mustHave, 'has', 'have')} no match yet.`, 'map', 'map', where);
    if (a?.issues.high) add(`serious-${r.name}`, TIER.serious, `The last check found ${num(a.issues.high)} serious ${plural(a.issues.high, 'problem')}. Fix ${plural(a.issues.high, 'it', 'them')}, then load again.`, 'reconcile/overview', 'check', where);
    const recheck = a ? a.tables.filter(t => t.state === 'recheck').length : 0;
    if (recheck) add(`recheck-${r.name}`, TIER.recheck, `${num(recheck)} ${plural(recheck, 'table has', 'tables have')} changed since the last check. Check ${plural(recheck, 'it', 'them')} again.`, 'reconcile', 'check', where);
    const unchecked = a ? a.tables.filter(t => t.state === 'not_checked').length : 0;
    if (unchecked) add(`unchecked-${r.name}`, TIER.unchecked, `${num(unchecked)} ${plural(unchecked, 'table has', 'tables have')} not been checked yet.`, 'reconcile', 'check', where);
    const others = r.counts.open - r.counts.mustHave;
    if (others > 0) add(`match-${r.name}`, TIER.match, `${num(others)} ${plural(others, 'field')} in the new system ${plural(others, 'has', 'have')} no match yet. Match ${plural(others, 'it', 'them')} or mark ${plural(others, 'it', 'them')} as not used.`, 'map', 'map', where);
    if (a && a.status === 'clear' && !a.signedOff) add(`sign-${r.name}`, TIER.sign, 'All clear. The owner can now sign it off.', 'reconcile/overview', 'signoff', where);
  }

  const conflicts = trackerConflicts(project, fieldCheckIndex(project, runs, { finalRunId: project.reconFinalRunId || null })).length;
  if (conflicts) add('conflicts', TIER.conflicts, `${num(conflicts)} ${plural(conflicts, 'field is', 'fields are')} marked as passed, but the last check found a problem.`, 'verify', 'check');

  // Supplier questions, for fields that still have no match.
  const mapped = new Set((project.mappings || []).map(m => key(m.targetTable, m.targetColumn)));
  const asks = (project.templateImport?.questions || []).filter(q => !mapped.has(key(q.table, q.column))).length;
  if (asks) add('questions', TIER.questions, `Ask the supplier about ${num(asks)} ${plural(asks, 'field')} with a question. The list is on the field lists page.`, 'setup', 'setup');

  // Names read from screenshots that are not linked to a real field yet.
  const unlinked = screenTables(project.sourceSchema).reduce((n, t) => n + t.columns.filter(c => !c.link && SEARCHABLE.has(c.type || 'text')).length, 0);
  if (unlinked) add('screens', TIER.screens, `${num(unlinked)} ${plural(unlinked, 'name', 'names')} from screenshots ${plural(unlinked, 'is', 'are')} not linked to a real field yet.`, 'setup', 'setup');

  const s = ov.summary;
  if (s.areas && s.areasSigned === s.areas && !s.finalRun) add('final', TIER.final, 'Every area is signed off. Choose the final load once it has been run and checked.', 'reconcile/overview', 'signoff');
  const signedDone = s.areas > 0 && s.areasSigned === s.areas && s.finalRun && s.status.level === 'clear';
  if (signedDone && (project.mappings || []).length) {
    const exported = project.lastEvidenceExportAt;
    const changed = exported && project.lastEvidenceDigest !== evidenceDigest(buildExportPackage(project, null));
    if (!exported || changed) add('evidence', TIER.evidence, changed ? 'The move changed after the evidence pack was saved. Download it again.' : 'Download the evidence pack and keep it safe.', 'export', 'handover');
  }

  return items.sort((x, y) => x.tier - y.tier || (x.area === '') - (y.area === '') || x.area.localeCompare(y.area));
}
