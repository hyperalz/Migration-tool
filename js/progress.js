// Works out where a project stands: the state of each step and the single
// most useful thing to do next. Everything is derived from the project's own
// data, so the step bar and the project home can never disagree with it.

import { projectOverview } from './reconcile-overview.js';
import { buildExportPackage, evidenceDigest } from './export.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

// The five steps of a migration, and the screens that belong to each.
export const STEPS = [
  { key: 'setup', label: 'Set up', path: 'setup',
    screens: [{ key: 'setup', label: 'Field lists', path: 'setup' }, { key: 'invite', label: 'Team', path: 'invite' }] },
  { key: 'map', label: 'Map and agree', path: 'map', screens: [{ key: 'map', label: 'Mapping', path: 'map' }] },
  { key: 'check', label: 'Load and check', path: 'reconcile',
    screens: [{ key: 'reconcile', label: 'Check a load', path: 'reconcile' }, { key: 'verify', label: 'Field tracker', path: 'verify' }] },
  { key: 'signoff', label: 'Sign off', path: 'reconcile/overview', screens: [{ key: 'overview', label: 'Overview', path: 'reconcile/overview' }] },
  { key: 'handover', label: 'Hand over', path: 'export', screens: [{ key: 'export', label: 'Export and close', path: 'export' }] },
];

export const STATE_LABEL = { done: 'Done', progress: 'In progress', todo: 'Not started', blocked: 'Not yet possible' };

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
  out.setup = {
    state: haveBoth ? 'done' : (src.fields || tgt.fields) ? 'progress' : 'todo',
    summary: haveBoth
      ? `Old system: ${num(src.tables)} ${plural(src.tables, 'table')}, ${num(src.fields)} fields. New system: ${num(tgt.tables)} ${plural(tgt.tables, 'table')}, ${num(tgt.fields)} fields.`
      : src.fields ? 'The old system’s field list is loaded. The new system’s is still needed.'
        : tgt.fields ? 'The new system’s field list is loaded. The old system’s is still needed.'
          : 'Add the field list for each system.',
    next: src.fields ? 'Add the field list for the new system' : tgt.fields ? 'Add the field list for the old system' : 'Add the field lists for both systems',
    nextPath: 'setup',
  };

  // 2. Map and agree
  const missing = requiredUnmapped(project);
  if (!haveBoth) {
    out.map = { state: 'blocked', summary: 'Needs both field lists first.' };
  } else if (!mappings.length) {
    out.map = { state: 'todo', summary: 'No fields mapped yet.', next: 'Start mapping fields', nextPath: 'map' };
  } else {
    out.map = {
      state: missing ? 'progress' : 'done',
      summary: `${num(mappings.length)} ${plural(mappings.length, 'field')} mapped.`
        + (missing ? ` ${num(missing)} required ${plural(missing, 'field')} in the new system still ${plural(missing, 'has', 'have')} no source.` : ' Every required field in the new system has a source.'),
      next: `Map the ${num(missing)} required ${plural(missing, 'field')} that still ${plural(missing, 'has', 'have')} no source`,
      nextPath: 'map',
    };
  }

  // 3. Load and check
  const tracked = mappings.filter(m => m.verification?.status === 'signed_off').length;
  const trackerLine = mappings.length ? ` Field tracker: ${num(tracked)} of ${num(mappings.length)} signed off.` : '';
  if (!mappings.length) {
    out.check = { state: 'blocked', summary: 'Needs mapped fields first.' };
  } else if (o.checked === 0) {
    out.check = { state: 'todo', summary: `No loads checked yet.${trackerLine}`, next: 'Check the first trial load', nextPath: 'reconcile' };
  } else {
    const allClear = o.status.level === 'clear';
    const waiting = o.unchecked + o.recheck;
    out.check = {
      state: allClear ? 'done' : 'progress',
      summary: `${num(o.checked)} of ${num(o.tables)} ${plural(o.tables, 'table')} checked. ${o.status.headline}${trackerLine}`,
      next: waiting ? `Check a load for the ${num(waiting)} ${plural(waiting, 'table')} still waiting`
        : 'Fix the open issues, then check the next load',
      nextPath: 'reconcile',
    };
  }

  // 4. Sign off
  if (o.checked === 0) {
    out.signoff = { state: 'blocked', summary: 'Needs at least one checked load first.' };
  } else {
    const allSigned = o.areas > 0 && o.areasSigned === o.areas;
    const done = allSigned && Boolean(o.finalRun) && o.status.level === 'clear';
    const started = o.areasSigned > 0 || Boolean(o.finalRun);
    const unsigned = o.areas - o.areasSigned;
    out.signoff = {
      state: done ? 'done' : started ? 'progress' : 'todo',
      summary: `${num(o.areasSigned)} of ${num(o.areas)} ${plural(o.areas, 'area')} signed off. `
        + (o.finalRun ? `Final load: ${o.finalRun.label}.` : 'No final load chosen yet.'),
      next: !o.finalRun && allSigned ? 'Choose the final load once it has been run and checked'
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
