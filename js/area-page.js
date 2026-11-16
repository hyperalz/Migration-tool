// One page per area: everything about one part of the move in one place —
// where each step has got, what needs doing, every field and where it is,
// file checks if the move uses them, and the area's sign-off.
//
// It reads the same records as the home page (field-progress.js and
// work-queue.js), so the two can never disagree. No AI.

import { projectOverview, NO_AREA } from './reconcile-overview.js';
import { fieldStages, areaFields } from './field-progress.js';
import { areaBoard, todoList, STAGES } from './work-queue.js';
import { projectProblems, isOpen } from './problems.js';

export const STAGE_LABEL = {
  matched: 'Matched, SQL not sent',
  sent: 'SQL sent',
  inTest: 'In test, waiting for UAT',
  testFailed: 'Failed UAT in test',
  testPassed: 'Passed UAT in test',
  inLive: 'In live, waiting for UAT',
  liveFailed: 'Failed UAT in live',
  livePassed: 'Passed UAT in live',
  signed: 'Signed off',
};

export const AREA_TEXT = {
  signHelp: 'The service area manager signs off once live is correct and no more changes are needed. Signing off marks every field in this area as signed off.',
  notReady: 'Not every field has passed UAT in live yet. You can still record a sign-off, but check the fields that are still open first.',
  nothing: 'This area has no matched fields yet, so there is nothing to sign.',
};

export function areaPath(projectId, name) {
  return `#/projects/${projectId}/areas/${encodeURIComponent(name)}`;
}

/** Everything the area page shows, worked out from the project's own data. */
export function areaPageData(project, name) {
  const runs = project.reconRuns || [];
  const ov = projectOverview(project, runs, { finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [] });
  const row = areaBoard(project, ov).find(r => r.name === name) || null;
  if (!row) return null;
  const area = ov.areas.find(a => a.name === name) || null;
  const stages = fieldStages(project);
  const fields = (area ? areaFields(project, area) : []).map(m => {
    const last = m.verification?.history?.at(-1) || null;
    const stage = stages.get(m.id) || 'matched';
    return {
      id: m.id,
      table: m.targetTable,
      field: m.targetColumn,
      from: `${m.sourceTable}.${m.sourceColumn}`,
      stage,
      label: STAGE_LABEL[stage],
      open: !['livePassed', 'signed'].includes(stage),
      last: last ? { note: last.note || '', by: last.by || '', at: last.at || '' } : null,
    };
  });
  // Grouped by the new system's table, open fields first within each.
  const tables = [];
  for (const f of fields) {
    let t = tables.find(x => x.name === f.table);
    if (!t) { t = { name: f.table, fields: [] }; tables.push(t); }
    t.fields.push(f);
  }
  const rank = f => ['liveFailed', 'testFailed', 'inLive', 'inTest', 'testPassed', 'sent', 'matched', 'livePassed', 'signed'].indexOf(f.stage);
  tables.forEach(t => t.fields.sort((a, b) => rank(a) - rank(b) || a.field.localeCompare(b.field)));
  return {
    name,
    label: name === NO_AREA ? 'Fields with no area' : name,
    cells: STAGES.map(s => ({ ...s, ...row.cells[s.key] })),
    todo: todoList(project).filter(t => t.area === name),
    tables,
    open: fields.filter(f => f.open).length,
    area,
    ready: row.ready,
    signedOff: Boolean(area?.signedOff) || row.cells.agree.state === 'done',
    signoffs: (project.reconAreaSignoffs || []).filter(s => s.area === name).slice().reverse(),
    usesFileChecks: runs.length > 0,
    problems: projectProblems(project).filter(p => p.area === name && isOpen(p)),
  };
}
