import { stillExpected } from './deliveries.js';
// Works out where a project stands: the state of each step and the single
// most useful thing to do next. Everything is derived from the project's own
// data, so the step bar and the project home can never disagree with it.

import { projectOverview } from './reconcile-overview.js';
import { buildExportPackage, evidenceDigest } from './export.js';
import { fieldCheckIndex, trackerConflicts } from './field-checks.js';
import { fieldStages, stageCounts } from './field-progress.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

// The five steps of a migration, and the screens that belong to each.
export const STEPS = [
  { key: 'setup', label: 'Field lists', path: 'setup',
    screens: [{ key: 'setup', label: 'Field lists', path: 'setup' }, { key: 'invite', label: 'Team', path: 'invite', hidden: true }] },
  { key: 'map', label: 'Match', path: 'map', screens: [{ key: 'map', label: 'Match fields', path: 'map' }] },
  { key: 'check', label: 'Load and test', path: 'verify',
    screens: [{ key: 'verify', label: 'Field tracker', path: 'verify' }, { key: 'reconcile', label: 'Compare files (optional)', path: 'reconcile' }] },
  { key: 'signoff', label: 'Sign off', path: 'reconcile/overview', screens: [{ key: 'overview', label: 'Overview', path: 'reconcile/overview' }] },
  { key: 'handover', label: 'Hand over', path: 'export', screens: [{ key: 'export', label: 'Downloads and close', path: 'export' }] },
];

export const STATE_LABEL = { done: 'Done', progress: 'In progress', todo: 'Not started', blocked: 'Not yet possible' };

// Screens shown in the step bar and on the home page. A hidden screen still
// opens from its address, but nothing links to it (Team, for now).
export function visibleScreens(step) {
  return (step?.screens || []).filter(sc => !sc.hidden);
}

export function stepForScreen(screenKey) {
  return STEPS.find(s => s.screens.some(sc => sc.key === screenKey)) || null;
}

function schemaCounts(schema) {
  const tables = schema?.tables || [];
  return { tables: tables.length, fields: tables.reduce((n, t) => n + (t.columns?.length || 0), 0) };
}

function requiredUnmapped(project) {
  const mapped = new Set((project.mappings || []).map(m => `${m.targetTable}␟${m.targetColumn}`));
  let n = 0;
  for (const t of project.targetSchema?.tables || []) {
    for (const c of t.columns || []) {
      if (c.required === true && !mapped.has(`${t.name}␟${c.name}`)) n++;
    }
  }
  return n;
}

function anyRequiredKnown(project) {
  return (project.targetSchema?.tables || []).some(t => (t.columns || []).some(c => c.required === true));
}

// New-system fields with no match that nobody has marked as not used.
function openFields(project) {
  const mapped = new Set((project.mappings || []).map(m => `${m.targetTable}\u241f${m.targetColumn}`));
  const ruledOut = new Set((project.templateImport?.notUsed || []).map(x => `${x.table}\u241f${x.column}`));
  let n = 0;
  for (const t of project.targetSchema?.tables || []) {
    for (const c of t.columns || []) {
      const key = `${t.name}\u241f${c.name}`;
      if (!mapped.has(key) && !ruledOut.has(key)) n++;
    }
  }
  return n;
}

export function projectProgress(project) {
  const src = schemaCounts(project.sourceSchema);
  const tgt = schemaCounts(project.targetSchema);
  const mappings = project.mappings || [];
  const runs = project.reconRuns || [];
  const overview = projectOverview(project, runs, {
    finalRunId: project.reconFinalRunId || null,
    signoffs: project.reconAreaSignoffs || [],
  });
  const o = overview.summary;
  const out = {};

  // 1. Set up
  const haveBoth = src.fields > 0 && tgt.fields > 0;
  const waiting = stillExpected(project).length;
  out.setup = {
    state: haveBoth ? (waiting ? 'progress' : 'done') : (src.fields || tgt.fields) ? 'progress' : 'todo',
    summary: haveBoth
      ? `Old system: ${num(src.tables)} ${plural(src.tables, 'table')}, ${num(src.fields)} fields. New system: ${num(tgt.tables)} ${plural(tgt.tables, 'table')}, ${num(tgt.fields)} fields.`
      : src.fields ? 'The old system’s field list is loaded. The new system’s is still needed.'
        : tgt.fields ? 'The new system’s field list is loaded. The old system’s is still needed.'
          : 'Add the field list for each system.',
    next: src.fields ? 'Add the field list for the new system' : tgt.fields ? 'Add the field list for the old system' : 'Add the field lists for both systems',
    nextPath: 'setup',
  };
  if (haveBoth && waiting) {
    out.setup.summary += ` Waiting for ${num(waiting)} ${plural(waiting, 'table')} still to come.`;
    out.setup.next = 'Add the tables still to come';
  }

  // 2. Map and agree
  const missing = requiredUnmapped(project);
  if (!haveBoth) {
    out.map = { state: 'blocked', summary: 'Needs both field lists first.' };
  } else if (!mappings.length) {
    out.map = { state: 'todo', summary: 'No fields matched yet.', next: 'Start matching fields', nextPath: 'map' };
  } else if (!missing && !anyRequiredKnown(project) && openFields(project) > 0) {
    // The field list does not say which fields are required, so "done" cannot
    // be judged from that. Go by fields that are neither matched nor ruled out.
    const open = openFields(project);
    out.map = {
      state: 'progress',
      summary: `${num(mappings.length)} ${plural(mappings.length, 'field')} matched. ${num(open)} ${plural(open, 'field')} in the new system ${plural(open, 'has', 'have')} no match and ${plural(open, 'has', 'have')} not been ruled out.`,
      next: `Match or rule out the ${num(open)} ${plural(open, 'field')} with no match yet`,
      nextPath: 'map',
    };
  } else {
    out.map = {
      state: missing ? 'progress' : 'done',
      summary: `${num(mappings.length)} ${plural(mappings.length, 'field')} matched.`
        + (missing ? ` ${num(missing)} ${plural(missing, 'field')} the new system must have still ${plural(missing, 'has', 'have')} no match.` : ' Every field the new system must have is matched.'),
      next: `Match the ${num(missing)} ${plural(missing, 'field')} the new system must have`,
      nextPath: 'map',
    };
  }

  // 3. Load and check
  const tracked = mappings.filter(m => m.verification?.status === 'signed_off').length;
  const conflicts = trackerConflicts(project, fieldCheckIndex(project, runs, { finalRunId: project.reconFinalRunId || null })).length;
  const trackerLine = (mappings.length ? ` Field tracker: ${num(tracked)} of ${num(mappings.length)} signed off.` : '')
    + (conflicts ? ` ${num(conflicts)} ${plural(conflicts, 'field is', 'fields are')} marked as passed but failing ${plural(conflicts, 'its', 'their')} latest check.` : '');
  // Checks recorded in the field tracker (in the new system's own screens)
  // count as much as file checks.
  const fc = stageCounts(mappings, fieldStages(project));
  const trackerActive = fc.total - fc.matched - fc.sent > 0;
  if (!mappings.length) {
    out.check = { state: 'blocked', summary: 'Needs matched fields first.' };
  } else if (o.checked === 0 && trackerActive) {
    out.check = {
      state: fc.done === fc.total ? 'done' : 'progress',
      summary: `${num(fc.done)} of ${num(fc.total)} ${plural(fc.total, 'field')} passed UAT in live. ${num(fc.passedTest)} passed UAT in test.`
        + (fc.failed ? ` ${num(fc.failed)} failed.` : '') + (fc.waiting ? ` ${num(fc.waiting)} waiting for UAT.` : ''),
      next: fc.liveFailed ? `Fix the ${num(fc.liveFailed)} ${plural(fc.liveFailed, 'field')} that failed UAT in live`
        : fc.testFailed ? `Fix the ${num(fc.testFailed)} ${plural(fc.testFailed, 'field')} that failed UAT in test, then send again`
          : fc.waiting ? `Do UAT on the ${num(fc.waiting)} ${plural(fc.waiting, 'field')} waiting for it`
            : fc.testPassed ? `Load the ${num(fc.testPassed)} ${plural(fc.testPassed, 'field')} that passed UAT in test into live`
              : `Send the SQL for the ${num(fc.matched + fc.sent)} ${plural(fc.matched + fc.sent, 'field')} still to test`,
      nextPath: 'verify',
    };
  } else if (o.checked === 0) {
    out.check = { state: 'todo', summary: `No loads checked yet.${trackerLine}`, next: 'Check the first trial load', nextPath: 'reconcile' };
  } else {
    const allClear = o.status.level === 'clear';
    const waiting = o.unchecked + o.recheck;
    out.check = {
      state: allClear ? 'done' : 'progress',
      summary: `${num(o.checked)} of ${num(o.tables)} ${plural(o.tables, 'table')} checked. ${o.status.headline}${trackerLine}`,
      next: waiting ? `Compare files for the ${num(waiting)} ${plural(waiting, 'table')} still waiting`
        : 'Fix the open issues, then check the next load',
      nextPath: 'reconcile',
    };
  }

  // 4. Sign off
  if (o.checked === 0 && !fc.done) {
    out.signoff = { state: 'blocked', summary: 'Needs at least one checked load first.' };
  } else {
    const allSigned = o.areas > 0 && o.areasSigned === o.areas;
    // With file checks, the final load must be chosen and clear. Without
    // them, the area sign-offs are the decision.
    const done = allSigned && (runs.length ? Boolean(o.finalRun) && o.status.level === 'clear' : true);
    const started = o.areasSigned > 0 || Boolean(o.finalRun);
    const unsigned = o.areas - o.areasSigned;
    out.signoff = {
      state: done ? 'done' : started ? 'progress' : 'todo',
      summary: `${num(o.areasSigned)} of ${num(o.areas)} ${plural(o.areas, 'area')} signed off.`
        + (!runs.length ? '' : o.finalRun ? ` Final load: ${o.finalRun.label}.` : ' No final load chosen yet.'),
      next: runs.length && !o.finalRun && allSigned ? 'Choose the final load once it has been run and checked'
        : unsigned ? `Record sign-off for ${num(unsigned)} ${plural(unsigned, 'area')}` : 'Clear the remaining issues on the final load',
      nextPath: 'reconcile/overview',
    };
  }

  // 5. Hand over
  if (!mappings.length) {
    out.handover = { state: 'blocked', summary: 'Nothing to hand over yet.' };
  } else {
    const exported = project.lastEvidenceExportAt || null;
    const changed = Boolean(exported) && project.lastEvidenceDigest !== evidenceDigest(buildExportPackage(project, null));
    out.handover = {
      state: exported && !changed ? 'done' : exported ? 'progress' : 'todo',
      summary: !exported ? 'Download the evidence pack, then close the project.'
        : changed ? 'The project has changed since the evidence pack was downloaded. Download it again before closing.'
          : 'Evidence pack downloaded and up to date. Close the project when you no longer need it here.',
      exportedAt: exported,
      evidenceChanged: changed,
      next: changed ? 'Download the evidence pack again' : 'Download the evidence pack',
      nextPath: 'export',
    };
  }

  const steps = STEPS.map((s, i) => ({ ...s, number: i + 1, ...out[s.key] }));

  // The next thing to do: the first step that is neither done nor blocked.
  // Hand-over only becomes "next" once sign-off is done.
  let nextStep = steps.find(s => s.key !== 'handover' && (s.state === 'todo' || s.state === 'progress'));
  if (!nextStep && (out.handover.state === 'todo' || out.handover.state === 'progress')) nextStep = steps.find(s => s.key === 'handover');
  const next = nextStep ? { step: nextStep.key, label: nextStep.label, text: nextStep.next, path: nextStep.nextPath } : null;

  return { steps, next, overview };
}
