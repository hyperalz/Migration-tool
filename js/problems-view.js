// The problems log page. See problems.js for how problems are worked out.

import { getProject } from './store.js';
import { fieldTag } from './system-tags.js';
import { projectProblems, problemCounts, filterProblems, problemsCsv, isOpen, PROBLEM_STATUS, WHERE_LABEL, PROBLEMS_TEXT } from './problems.js';
import { areaPath } from './area-page.js';
import { NO_AREA } from './reconcile-overview.js';
import { oldName, newName } from './words.js';
import { downloadText } from './export.js';

const day = iso => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const num = n => Number(n).toLocaleString('en-GB');

// A table of problems, used here and on the area page.
export function problemsTable(id, rows, esc, { showArea = true } = {}) {
  return `<div class="schema-preview problems-table"><table>
    <thead><tr><th scope="col">Field</th>${showArea ? '<th scope="col">Area</th>' : ''}<th scope="col">Found in</th><th scope="col">What went wrong</th><th scope="col">Raised</th><th scope="col">Where it is</th></tr></thead>
    <tbody>${rows.map(r => `
      <tr class="problem-${r.status}">
        <td>${fieldTag('new', `${r.table}.${r.field}`, esc)}<div class="recon-sub sys-from">from ${fieldTag('old', r.from, esc)}</div></td>
        ${showArea ? `<td><a href="${areaPath(id, r.area)}">${esc(r.area === NO_AREA ? 'No area' : r.area)}</a></td>` : ''}
        <td>${esc(WHERE_LABEL[r.where])}<div class="recon-sub">Round ${num(r.round)}</div></td>
        <td>${esc(r.note || '—')}${r.reference ? `<div class="recon-sub">Ref: ${esc(r.reference)}</div>` : ''}</td>
        <td>${esc(r.by)}<div class="recon-sub">${esc(day(r.at))}</div></td>
        <td><span class="problem-status problem-status-${r.status}">${esc(PROBLEM_STATUS[r.status])}</span>${r.closedAt && !isOpen(r) ? `<div class="recon-sub">${esc(r.closedBy)} · ${esc(day(r.closedAt))}</div>` : ''}</td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

export function renderProblems({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const all = projectProblems(project);
  const counts = problemCounts(all);
  const areas = [...new Set(all.map(r => r.area))].sort();
  const state = { show: counts.open ? 'open' : 'all', where: '', area: '' };

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'problems')}
    <div class="page-head"><div>
      <h1>${esc(PROBLEMS_TEXT.title)}</h1>
      <p>${esc(PROBLEMS_TEXT.lead)}</p>
    </div></div>
    ${all.length ? `
      <section class="card area-cells problems-counts" aria-label="Problem counts">
        <div class="area-cell area-cell-${counts.openLive ? 'failed' : 'done'}"><span class="area-cell-label">Open in live</span><span class="area-cell-text">${num(counts.openLive)}</span></div>
        <div class="area-cell area-cell-${counts.openTest ? 'failed' : 'done'}"><span class="area-cell-label">Open in test</span><span class="area-cell-text">${num(counts.openTest)}</span></div>
        <div class="area-cell area-cell-done"><span class="area-cell-label">Fixed</span><span class="area-cell-text">${num(counts.fixed)}</span></div>
      </section>
      <section class="card">
        <form class="problems-filters" id="problems-filters">
          <div class="field"><label for="pf-show">Show</label><select id="pf-show" name="show">
            <option value="open" ${state.show === 'open' ? 'selected' : ''}>Open problems</option><option value="all" ${state.show === 'all' ? 'selected' : ''}>All problems</option></select></div>
          <div class="field"><label for="pf-where">Found in</label><select id="pf-where" name="where">
            <option value="">Test and live</option><option value="test">Test</option><option value="live">Live</option></select></div>
          <div class="field"><label for="pf-area">Area</label><select id="pf-area" name="area">
            <option value="">All areas</option>${areas.map(a => `<option value="${esc(a)}">${esc(a === NO_AREA ? 'No area' : a)}</option>`).join('')}</select></div>
          <button type="button" class="btn btn-secondary btn-sm" id="problems-download">${esc(PROBLEMS_TEXT.download)}</button>
        </form>
        <p class="recon-sub" id="problems-shown" aria-live="polite"></p>
        <div id="problems-list"></div>
      </section>` : `<section class="card empty-state"><p>${esc(PROBLEMS_TEXT.none)}</p>
        <a class="btn btn-primary" style="margin-top:1rem" href="#/projects/${id}/verify">Open the field tracker</a></section>`}
  `);
  ui.attachLogout();
  if (!all.length) return;

  const draw = () => {
    const rows = filterProblems(all, state);
    document.getElementById('problems-shown').textContent = `Showing ${num(rows.length)} of ${num(all.length)}.`;
    document.getElementById('problems-list').innerHTML = rows.length
      ? problemsTable(id, rows, esc)
      : `<p>${esc(state.show === 'open' && !state.where && !state.area ? PROBLEMS_TEXT.noneOpen : 'Nothing matches these choices.')}</p>`;
  };
  document.getElementById('problems-filters').addEventListener('change', e => {
    const fd = new FormData(e.currentTarget);
    state.show = fd.get('show'); state.where = fd.get('where'); state.area = fd.get('area');
    draw();
  });
  document.getElementById('problems-download').addEventListener('click', () => {
    const rows = filterProblems(all, state);
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const csv = problemsCsv(rows, { oldName: cap(oldName(project)), newName: cap(newName(project)) });
    downloadText('﻿' + csv, `${(project.name || 'move').replace(/[^\w-]+/g, '-')}-problems.csv`, 'text/csv');
    ui.toast(`Downloaded ${num(rows.length)} ${rows.length === 1 ? 'problem' : 'problems'}`);
  });
  draw();
}
