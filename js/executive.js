// The executive overview: one page for a finance director or programme
// board. It answers six questions in plain words: are we ready, where is
// each area, is the data right, is it getting better, who has signed off,
// and can we prove it. Everything here is read from what has been recorded
// and checked. No AI, and nothing here decides go-live: people do.

import { projectOverview, NO_AREA } from './reconcile-overview.js';
import { areaBoard, todoList, STAGES } from './work-queue.js';
import { fieldStages, stageCounts } from './field-progress.js';
import { projectProblems, problemCounts } from './problems.js';
import { plainSummary } from './reconcile-plain.js';
import { areaManager } from './settings.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const pct = (a, b) => (b ? Math.floor((a / b) * 1000) / 10 : null);

export const EXEC_TEXT = {
  title: 'Executive overview',
  lead: 'Where the move stands, on one page. Every figure comes from the checks and records in this project.',
  notDecide: 'This page shows the evidence. It does not decide go-live. That decision belongs to the people who sign.',
};

export const READINESS = {
  blocked: { label: 'Not ready for go-live', tone: 'red' },
  progress: { label: 'In progress', tone: 'amber' },
  ready: { label: 'Ready for the go-live decision', tone: 'green' },
  empty: { label: 'Not started', tone: 'grey' },
};

const AREA_RAG = { red: 'Problems to fix', amber: 'In progress', green: 'Signed off', grey: 'Not started' };
const STAGE_NOW = Object.fromEntries(STAGES.map(s => [s.key, s.label]));

function runCounts(run) {
  const s = run.summary || {};
  const bs = s.bySeverity || { high: 0, medium: 0, low: 0 };
  return {
    id: run.id, label: run.label, at: run.at,
    serious: bs.high, smaller: bs.medium + bs.low,
    matchRate: pct(s.fieldsMatched || 0, s.fieldsCompared || 0),
    totals: { checked: s.totalsChecked || 0, agreed: s.totalsAgreed || 0 },
  };
}

/**
 * Everything the executive page shows, worked out from the project.
 * @param {object} project
 * @param {{ evidenceChanged?: boolean }} [opts]  whether the project changed since the evidence pack was last downloaded
 */
export function executiveSummary(project, { evidenceChanged = false } = {}) {
  const runs = project.reconRuns || [];
  const ov = projectOverview(project, runs, { finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [] });
  const board = areaBoard(project, ov);
  const todo = todoList(project);
  const stages = fieldStages(project);
  const fields = stageCounts(project.mappings || [], stages);
  const problems = problemCounts(projectProblems(project));

  // ----- the trend: one entry per checked load, oldest first -----
  const trend = runs.map(runCounts);
  const latest = trend[trend.length - 1] || null;
  const first = trend[0] || null;
  let trendLine = '';
  if (trend.length >= 2) {
    const a = first.serious, b = latest.serious;
    trendLine = b < a ? `Serious problems down from ${num(a)} to ${num(b)} since ${first.label}.`
      : b > a ? `Serious problems up from ${num(a)} to ${num(b)} since ${first.label}.`
        : `Serious problems unchanged at ${num(b)} since ${first.label}.`;
  } else if (latest) trendLine = `One file comparison so far. Compare the next load to see the trend.`;

  // ----- areas -----
  const areas = board.filter(r => r.name !== NO_AREA || r.counts.stages.total).map(r => {
    const a = ov.areas.find(x => x.name === r.name);
    const st = r.counts.stages;
    const signed = Boolean(a?.signedOff) || (st.total > 0 && st.signed === st.total);
    let rag;
    if (signed) rag = 'green';
    else if (a?.issues.high || st.failed) rag = 'red';
    else if (r.now === 'list' && !r.counts.fields) rag = 'grey';
    else rag = 'amber';
    const next = todo.find(t => t.area === r.name);
    return {
      name: r.name,
      manager: areaManager(project, r.name),
      rag, ragLabel: AREA_RAG[rag],
      now: r.now === 'done' ? 'Done' : STAGE_NOW[r.now],
      fieldsDone: st.done, fieldsTotal: st.total,
      serious: a?.issues.high || 0,
      next: signed ? '' : (next?.text || ''),
      signedBy: a?.signedOff ? a.signoff.name : (signed ? 'Signed off' : ''),
    };
  });

  // ----- top risks: the serious problems from the latest check, with owners -----
  // Testing on screen comes first; problems from file comparisons follow.
  const latestRun = runs[runs.length - 1] || null;
  const risks = [];
  if (fields.liveFailed) risks.push({ text: `${num(fields.liveFailed)} ${plural(fields.liveFailed, 'field')} failed testing in live.`, why: 'What people see in live is wrong.', area: '' });
  if (fields.testFailed) risks.push({ text: `${num(fields.testFailed)} ${plural(fields.testFailed, 'field')} failed testing in test.`, why: 'They need fixing before they can go into live.', area: '' });
  if (latestRun) {
    const plain = plainSummary(latestRun, runs, project);
    for (const i of plain.issues.filter(x => x.severity === 'high')) risks.push({ text: i.text, why: i.why, area: i.area });
  }

  // ----- readiness -----
  const blockers = [];
  if (ov.summary.high) blockers.push(`${num(ov.summary.high)} serious data ${plural(ov.summary.high, 'problem')} open.`);
  if (fields.liveFailed) blockers.push(`${num(fields.liveFailed)} ${plural(fields.liveFailed, 'field')} failed testing in live.`);
  if (fields.testFailed) blockers.push(`${num(fields.testFailed)} ${plural(fields.testFailed, 'field')} failed testing in test.`);
  const areasSigned = areas.filter(a => a.rag === 'green').length;
  let level;
  if (!fields.total && !runs.length) level = 'empty';
  else if (blockers.length) level = 'blocked';
  else if (areas.length && areasSigned === areas.length && fields.done === fields.total) level = 'ready';
  else level = 'progress';
  const left = [];
  if (fields.total && fields.done < fields.total) {
    left.push(fields.done ? `${num(fields.done)} of ${num(fields.total)} fields are correct in live so far.`
      : `None of the ${num(fields.total)} fields is correct in live yet.`);
  }
  if (areas.length && areasSigned < areas.length) {
    left.push(areasSigned ? `${num(areasSigned)} of ${num(areas.length)} areas signed off.`
      : `No ${plural(areas.length, 'area')} signed off yet.`);
  }
  const reason = level === 'blocked' ? blockers.join(' ')
    : level === 'ready' ? 'Every area is signed off and every field is correct in live. Nothing serious is open.'
      : level === 'empty' ? 'No fields have been matched or checked yet.'
        : (left.join(' ') || 'Nothing serious is open.');

  // ----- proof -----
  const proof = {
    fieldsDone: fields.done, fieldsTotal: fields.total,
    areasSigned, areasTotal: areas.length,
    checks: runs.length,
    lastCheck: latest ? { label: latest.label, at: latest.at } : null,
    finalLoad: ov.summary.finalRun,
    problemsFound: problems.total, problemsFixed: problems.fixed, problemsOpen: problems.open,
    evidenceAt: project.lastEvidenceExportAt || null,
    evidenceChanged: Boolean(project.lastEvidenceExportAt) && evidenceChanged,
  };

  return {
    readiness: { level, ...READINESS[level], reason, left: level === 'blocked' ? left : [] },
    tiles: {
      fieldsDone: { done: fields.done, total: fields.total, pct: pct(fields.done, fields.total) },
      fieldsTested: { done: fields.passedTest, total: fields.total },
      open: { testing: problems.open, files: ov.summary.high, total: problems.open + ov.summary.high },
      latestMatch: latest ? { pct: latest.matchRate, label: latest.label, totals: latest.totals } : null,
      serious: { open: ov.summary.high, smaller: ov.summary.other },
      signed: { done: areasSigned, total: areas.length },
    },
    trend, trendLine,
    areas,
    risks: risks.slice(0, 5), moreRisks: Math.max(0, risks.length - 5),
    proof,
  };
}
