// Rolls the table-by-table checks up to areas and to the whole project.
//
// Rules, so the roll-up cannot look better than the detail:
//   1. Worst status wins: an area is only as good as its worst table.
//   2. Unchecked is not clear: a mapped table with no check stops its area
//      and the project from showing as clear.
//   3. A table whose mappings changed after its last check needs re-checking.
//   4. Once a final load is chosen, every table is judged on that load alone.
//
// Nothing here re-decides a result. It only reads what the checks found.

import { tablePairs, mappingStamp } from './reconcile.js';
import { tableNoun } from './reconcile-plain.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

export const NO_AREA = 'No area set';

// attention > incomplete > nearly > clear
const RANK = { attention: 3, incomplete: 2, nearly: 1, clear: 0 };
export const STATUS_LABEL = {
  attention: 'Needs attention', incomplete: 'Incomplete', nearly: 'Nearly there', clear: 'All clear',
};

function worst(levels) {
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'clear');
}

// The area a table belongs to: the service area most of its mapped fields carry.
function areaOf(pair) {
  const tally = new Map();
  for (const m of pair.mappings) {
    const a = (m.serviceArea || '').trim();
    if (a) tally.set(a, (tally.get(a) || 0) + 1);
  }
  let best = NO_AREA;
  let bestCount = 0;
  for (const [a, n] of tally) if (n > bestCount) { best = a; bestCount = n; }
  return best;
}

function issueCounts(pairResult) {
  const c = { high: 0, medium: 0, low: 0, total: 0 };
  for (const g of pairResult.groups) { c[g.severity]++; c.total++; }
  return c;
}

// Identifies exactly which check each table in an area was signed against.
function areaStamp(tables) {
  return tables.map(t => `${t.id}@${t.run ? t.run.id : 'none'}`).sort().join('|');
}

/**
 * @param {object} project
 * @param {object[]} runs        every run, oldest first
 * @param {object} [opts]
 * @param {string} [opts.finalRunId]  if set, every table is judged on this run only
 * @param {object[]} [opts.signoffs]  [{ area, name, role, note, at, stamp }]
 */
export function projectOverview(project, runs = [], { finalRunId = null, signoffs = [] } = {}) {
  const pairs = tablePairs(project.mappings || []);
  const finalRun = finalRunId ? runs.find(r => r.id === finalRunId) || null : null;

  const tables = pairs.map(pair => {
    const history = runs.filter(r => r.pairs.some(p => p.id === pair.id));
    const basisRun = finalRun
      ? (finalRun.pairs.some(p => p.id === pair.id) ? finalRun : null)
      : history[history.length - 1] || null;
    const result = basisRun ? basisRun.pairs.find(p => p.id === pair.id) : null;

    const t = {
      id: pair.id,
      sourceTable: pair.sourceTable,
      targetTable: pair.targetTable,
      noun: tableNoun(pair.sourceTable),
      area: areaOf(pair),
      mappedFields: pair.mappings.length,
      run: basisRun ? { id: basisRun.id, label: basisRun.label, at: basisRun.at } : null,
      checks: history.length,
      trend: history.map(r => r.pairs.find(p => p.id === pair.id).groups.length),
      issues: { high: 0, medium: 0, low: 0, total: 0 },
      records: null, matchRate: null, totals: null,
      mappingsChanged: false,
      notes: [],
      status: 'incomplete',
      state: 'not_checked', // not_checked | recheck | checked
    };

    if (!result) {
      t.notes.push(finalRun
        ? (history.length ? 'Not included in the final load' : 'Never checked')
        : 'Not checked yet');
      return t;
    }

    t.issues = issueCounts(result);
    t.records = { old: result.counts.source, new: result.counts.target };
    t.matchRate = result.fieldsCompared ? result.fieldsMatched / result.fieldsCompared : null;
    const totalled = result.fields.filter(f => f.total);
    t.totals = { checked: totalled.length, agreed: totalled.filter(f => f.total.diff === 0).length };

    // Older runs carry no stamp, so a change cannot be detected for them.
    if (result.mappingStamp && result.mappingStamp !== mappingStamp(pair)) {
      t.mappingsChanged = true;
      t.notes.push('Mappings changed since this check, so it needs re-checking');
    }
    const skipped = result.fields.filter(f => f.skipped).length;
    if (skipped) t.notes.push(`${skipped} mapped ${plural(skipped, 'field')} could not be checked`);

    t.state = t.mappingsChanged ? 'recheck' : 'checked';
    if (t.issues.high) t.status = 'attention';
    else if (t.mappingsChanged) t.status = 'incomplete';
    else if (t.issues.total) t.status = 'nearly';
    else t.status = 'clear';
    return t;
  });

  // ----- areas -----
  const areaNames = [...new Set(tables.map(t => t.area))].sort((a, b) =>
    (a === NO_AREA) - (b === NO_AREA) || a.localeCompare(b));
  const areas = areaNames.map(name => {
    const mine = tables.filter(t => t.area === name);
    const stamp = areaStamp(mine);
    const latest = signoffs.filter(s => s.area === name).slice(-1)[0] || null;
    return {
      name,
      status: worst(mine.map(t => t.status)),
      tables: mine,
      issues: mine.reduce((acc, t) => ({ high: acc.high + t.issues.high, other: acc.other + t.issues.medium + t.issues.low }), { high: 0, other: 0 }),
      stamp,
      signoff: latest,
      // A sign-off only counts for the exact checks it was made against.
      signoffCurrent: Boolean(latest) && latest.stamp === stamp,
      // Signed off, and nothing has been re-checked since.
      signedOff: Boolean(latest) && latest.stamp === stamp && latest.role === 'Signed off',
    };
  });

  // ----- project -----
  const unchecked = tables.filter(t => t.state === 'not_checked').length;
  const recheck = tables.filter(t => t.state === 'recheck').length;
  const high = tables.reduce((n, t) => n + t.issues.high, 0);
  const other = tables.reduce((n, t) => n + t.issues.medium + t.issues.low, 0);
  const level = tables.length ? worst(tables.map(t => t.status)) : 'incomplete';
  const areasWithHigh = areas.filter(a => a.issues.high).length;

  const gaps = [];
  if (unchecked) {
    gaps.push(finalRun
      ? `${num(unchecked)} ${plural(unchecked, 'table was', 'tables were')} not in the final load.`
      : `${num(unchecked)} ${plural(unchecked, 'table has', 'tables have')} not been checked yet.`);
  }
  if (recheck) gaps.push(`${num(recheck)} ${plural(recheck, 'table needs', 'tables need')} re-checking because ${plural(recheck, 'its', 'their')} mappings changed.`);

  let headline;
  if (!tables.length) headline = 'No fields have been mapped yet, so there is nothing to check.';
  else if (level === 'attention') headline = [`${num(high)} serious ${plural(high, 'issue')} open across ${num(areasWithHigh)} ${plural(areasWithHigh, 'area')}.`, ...gaps].join(' ');
  else if (level === 'incomplete') headline = gaps.join(' ');
  else if (level === 'nearly') headline = `No serious issues. ${num(other)} smaller ${plural(other, 'issue')} open.`;
  else headline = finalRun ? 'Every mapped table passed on the final load.' : 'Every mapped table passed its latest check.';

  return {
    tables, areas,
    summary: {
      status: { level, label: STATUS_LABEL[level], headline },
      tables: tables.length,
      checked: tables.length - unchecked,
      clear: tables.filter(t => t.status === 'clear').length,
      unchecked, recheck, high, other,
      areas: areas.length,
      areasClear: areas.filter(a => a.status === 'clear').length,
      areasSigned: areas.filter(a => a.signedOff).length,
      finalRun: finalRun ? { id: finalRun.id, label: finalRun.label, at: finalRun.at } : null,
      finalRunMissing: Boolean(finalRunId) && !finalRun,
    },
  };
}

export function buildAreaSignoff(area, { name, role, note }) {
  return { area: area.name, name, role, note: note || '', at: new Date().toISOString(), stamp: area.stamp };
}
