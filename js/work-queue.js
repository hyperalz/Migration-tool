// A move is not a straight line. Different areas reach different stages,
// late news sends one area back, and a fix means checking again. This file
// shows that honestly:
//   areaBoard(): for each area, how far each stage has got.
//   todoList():  every open job, across all steps and areas, in one list,
//                with the jobs that hold other work up first.
// Everything is worked out from the project's own data. No AI, and nothing
// here decides a result: it only reads what the checks and lists say.

import { projectOverview, NO_AREA } from './reconcile-overview.js';

import { buildExportPackage, evidenceDigest } from './export.js';
import { SEARCHABLE, screenTables } from './trace.js';
import { fieldStages, stageCounts, areaFields } from './field-progress.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const key = (t, c) => `${t}␟${c}`;

// The real steps of a move, per area: list the fields, match them, send
// the SQL, UAT in test, UAT in live, and sign off once live is correct.
export const STAGES = [
  { key: 'list', label: 'List' },
  { key: 'match', label: 'Match' },
  { key: 'send', label: 'Send' },
  { key: 'test', label: 'Test' },
  { key: 'live', label: 'Live' },
  { key: 'agree', label: 'Sign off' },
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

  const stages = fieldStages(project);
  const rows = areaNamesOf(project, tAreas, ov).map(name => {
    const tables = (project.targetSchema?.tables || []).filter(t => tAreas.get(t.name) === name);
    const fields = tables.flatMap(t => (t.columns || []).map(c => ({ t: t.name, c })));
    const open = fields.filter(f => !mapped.has(key(f.t, f.c.name)) && !ruledOut.has(key(f.t, f.c.name)));
    const mustHave = open.filter(f => f.c.required === true).length;
    const area = ov.areas.find(a => a.name === name) || null;
    const checked = area ? area.tables.filter(t => t.state !== 'not_checked') : [];
    const toCheck = area ? area.tables.filter(t => t.state !== 'checked').length : 0;
    // Every matched field in the area, and how far each has got.
    const c = stageCounts(area ? areaFields(project, area) : [], stages);

    const list = fields.length ? { state: 'done', text: `${num(fields.length)} ${plural(fields.length, 'field')}` }
      : { state: 'open', text: 'Not in yet' };
    const match = !fields.length ? { state: 'none', text: '—' }
      : open.length ? { state: 'open', text: `${num(open.length)} to match${mustHave ? `, ${num(mustHave)} must` : ''}` }
        : { state: 'done', text: 'All matched' };
    const send = !c.total ? { state: 'none', text: '—' }
      : c.matched ? { state: 'open', text: `${num(c.matched)} to send` }
        : { state: 'done', text: 'All sent' };
    // UAT in test: everything from loaded into test up to passing it.
    let test;
    const loadedTest = c.total - c.matched - c.sent;
    if (!c.total || !loadedTest) test = { state: 'none', text: '—' };
    else if (c.testFailed) test = { state: 'open', text: `${num(c.testFailed)} failed` };
    else if (c.inTest) test = { state: 'open', text: `${num(c.inTest)} to check` };
    else if (c.passedTest === c.total) test = { state: 'done', text: 'All passed' };
    else test = { state: 'open', text: `${num(c.passedTest)} of ${num(c.total)} passed` };
    // UAT in live: fields move into live once they have passed testing in test.
    let live;
    const toLoad = c.testPassed;
    if (!c.total || (!c.reachedLive && !toLoad)) live = { state: 'none', text: '—' };
    else if (c.liveFailed) live = { state: 'open', text: `${num(c.liveFailed)} failed` };
    else if (c.inLive) live = { state: 'open', text: `${num(c.inLive)} to check` };
    else if (c.done === c.total) live = { state: 'done', text: 'All passed' };
    else if (toLoad) live = { state: 'open', text: `${num(toLoad)} to load` };
    else live = { state: 'open', text: `${num(c.done)} of ${num(c.total)} passed` };
    const ready = c.total > 0 && c.done === c.total && !(area?.issues.high);
    const agree = area?.signedOff || (c.total && c.signed === c.total)
      ? { state: 'done', text: area?.signedOff ? `Signed by ${area.signoff.name}` : 'Signed off' }
      : ready ? { state: 'open', text: 'Ready to sign' }
        : { state: 'none', text: '—' };

    // Where the area is now: the first stage that is not done.
    const cells = { list, match, send, test, live, agree };
    const now = STAGES.find(s => cells[s.key].state !== 'done')?.key || 'done';
    return { name, cells, now, ready, counts: { fields: fields.length, open: open.length, mustHave, toCheck, checked: checked.length, stages: c } };
  });
  return rows.filter(r => r.name !== NO_AREA || r.counts.fields || r.counts.stages.total);
}

// The order jobs are listed in. Lower comes first: it holds up more.
const TIER = {
  lists: 1, mustHave: 3, serious: 4, liveFailed: 5, failed: 6, recheck: 7, inLive: 8, testing: 9,
  toLive: 10, match: 11, send: 12, unchecked: 13, areaList: 13.5, questions: 14, screens: 15, sign: 16, final: 17, evidence: 18,
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
    if (newFields && !r.counts.fields && where) add(`list-${r.name}`, TIER.areaList, 'No fields are in this area yet. Choose the area for its fields in the field tracker, or remove the area in Settings.', 'verify', 'check', where);
    if (r.counts.mustHave) add(`must-${r.name}`, TIER.mustHave, `${num(r.counts.mustHave)} required ${plural(r.counts.mustHave, 'field')} in the new system not matched yet. Match ${plural(r.counts.mustHave, 'it', 'them')} first.`, 'map', 'map', where);
    if (a?.issues.high) add(`serious-${r.name}`, TIER.serious, `${num(a.issues.high)} serious ${plural(a.issues.high, 'problem')} found by the last file comparison. Fix ${plural(a.issues.high, 'it', 'them')}, then load again.`, 'reconcile/overview', 'check', where);
    const recheck = a ? a.tables.filter(t => t.state === 'recheck').length : 0;
    if (recheck) add(`recheck-${r.name}`, TIER.recheck, `${num(recheck)} ${plural(recheck, 'table', 'tables')} changed since the last file comparison. Compare ${plural(recheck, 'it', 'them')} again.`, 'reconcile', 'check', where);
    const st = r.counts.stages;
    if (st.liveFailed) add(`live-failed-${r.name}`, TIER.liveFailed, `${num(st.liveFailed)} ${plural(st.liveFailed, 'field')} failed testing in live. Fix ${plural(st.liveFailed, 'it', 'them')}, then load into live again.`, 'verify', 'check', where);
    if (st.testFailed) add(`failed-${r.name}`, TIER.failed, `${num(st.testFailed)} ${plural(st.testFailed, 'field')} failed testing in test. Fix the match or the data, then send again.`, 'verify', 'check', where);
    if (st.inLive) add(`in-live-${r.name}`, TIER.inLive, `${num(st.inLive)} ${plural(st.inLive, 'field', 'fields')} in live, waiting to be checked. Check ${plural(st.inLive, 'it', 'them')} on screen and record what you find.`, 'verify', 'check', where);
    if (st.inTest) add(`testing-${r.name}`, TIER.testing, `${num(st.inTest)} ${plural(st.inTest, 'field', 'fields')} in test, waiting to be checked. Check ${plural(st.inTest, 'it', 'them')} on screen and record what you find.`, 'verify', 'check', where);
    if (st.testPassed) add(`to-live-${r.name}`, TIER.toLive, `${num(st.testPassed)} ${plural(st.testPassed, 'field')} passed testing in test. Load ${plural(st.testPassed, 'it', 'them')} into live.`, 'verify', 'check', where);
    if (st.matched) add(`send-${r.name}`, TIER.send, `${num(st.matched)} matched ${plural(st.matched, 'field', 'fields')} not sent for loading yet. Send ${plural(st.matched, 'it', 'them')} to whoever loads the data.`, 'verify', 'check', where);
    // Tables with no file check: only listed when this move uses file checks.
    const unchecked = runs.length && a ? a.tables.filter(t => t.state === 'not_checked').length : 0;
    if (unchecked) add(`unchecked-${r.name}`, TIER.unchecked, `${num(unchecked)} ${plural(unchecked, 'table', 'tables')} not compared yet.`, 'reconcile', 'check', where);
    const others = r.counts.open - r.counts.mustHave;
    if (others > 0) add(`match-${r.name}`, TIER.match, `${num(others)} ${plural(others, 'field')} in the new system not matched yet. Match ${plural(others, 'it', 'them')} or mark ${plural(others, 'it', 'them')} as not used.`, 'map', 'map', where);
    if (r.ready && r.cells.agree.state !== 'done') add(`sign-${r.name}`, TIER.sign, 'Every field is correct in live. The service area manager can now sign it off.', 'reconcile/overview', 'signoff', where);
  }

  // A field marked as passed that a file check found a problem with now
  // counts as failed above, so it is not listed twice.

  // Supplier questions, for fields that still have no match.
  const mapped = new Set((project.mappings || []).map(m => key(m.targetTable, m.targetColumn)));
  const asks = (project.templateImport?.questions || []).filter(q => !mapped.has(key(q.table, q.column))).length;
  if (asks) add('questions', TIER.questions, `${num(asks)} ${plural(asks, 'field has', 'fields have')} a question for the supplier. The list is on the field lists page.`, 'setup', 'setup');

  // Names read from screenshots that are not linked to a real field yet.
  const unlinked = screenTables(project.sourceSchema).reduce((n, t) => n + t.columns.filter(c => !c.link && SEARCHABLE.has(c.type || 'text')).length, 0);
  if (unlinked) add('screens', TIER.screens, `${num(unlinked)} ${plural(unlinked, 'name', 'names')} from screenshots ${plural(unlinked, 'is', 'are')} not linked to a real field yet.`, 'setup', 'setup');

  const s = ov.summary;
  if (runs.length && s.areas && s.areasSigned === s.areas && !s.finalRun) add('final', TIER.final, 'Every area is signed off. Choose the final load once it has been run and checked.', 'reconcile/overview', 'signoff');
  const signedDone = s.areas > 0 && s.areasSigned === s.areas && (!runs.length || (s.finalRun && s.status.level === 'clear'));
  if (signedDone && (project.mappings || []).length) {
    const exported = project.lastEvidenceExportAt;
    const changed = exported && project.lastEvidenceDigest !== evidenceDigest(buildExportPackage(project, null));
    if (!exported || changed) add('evidence', TIER.evidence, changed ? 'The move changed after the evidence pack was saved. Download it again.' : 'Download the evidence pack and keep it safe.', 'export', 'handover');
  }

  return items.sort((x, y) => x.tier - y.tier || (x.area === '') - (y.area === '') || x.area.localeCompare(y.area));
}
