// The page for one area. See area-page.js for what it shows and why.

import { getProject, saveProject } from './store.js';
import { getCurrentUser } from './auth.js';
import { buildAreaSignoff, projectOverview } from './reconcile-overview.js';
import { signOffAreaFields } from './field-progress.js';
import { fileCheckTable } from './reconcile-view.js';
import { areaPageData, AREA_TEXT } from './area-page.js';
import { areaManager } from './settings.js';
import { GOVUK_TEXT, panelHtml, requiredErrors } from './govuk.js';
import { showErrors } from './govuk-view.js';
import { problemsTable } from './problems-view.js';
import { PROBLEMS_TEXT } from './problems.js';

const fmt = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const num = n => Number(n).toLocaleString('en-GB');

export function renderArea({ id, area }, ui, { justRecorded = null } = {}) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  let name;
  try { name = decodeURIComponent(area); } catch { name = area; }
  const d = areaPageData(project, name);
  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  if (!d) {
    ui.mount(`${ui.projectSteps(project, 'area')}
      <div class="card empty-state"><p>There is no area called “${esc(name)}” in this move.</p>
      <a class="btn btn-primary" style="margin-top:1rem" href="#/projects/${id}">Back to the home page</a></div>`);
    ui.attachLogout();
    return;
  }

  const cell = c => `<div class="area-cell area-cell-${c.state}"><span class="area-cell-label">${esc(c.label)}</span>
    <span class="area-cell-text">${c.state === 'done' ? '<span aria-hidden="true">✓ </span>' : ''}${esc(c.text)}</span></div>`;
  const fieldRow = f => `
    <tr class="${f.open ? '' : 'area-field-done'} area-stage-${f.stage}">
      <td><strong>${esc(f.field)}</strong><div class="recon-sub recon-mono">from ${esc(f.from)}</div></td>
      <td><span class="area-stage">${esc(f.label)}</span></td>
      <td>${f.last ? `${esc(f.last.note || '—')}<div class="recon-sub">${esc(f.last.by)}${f.last.at ? ` · ${esc(fmt(f.last.at))}` : ''}</div>` : '—'}</td>
    </tr>`;
  // The service area manager usually signs, so their name is filled in.
  const manager = areaManager(project, name);
  const userName = manager || getCurrentUser()?.name || '';

  ui.mount(`
    ${ui.projectSteps(project, 'area')}
    ${justRecorded ? panelHtml(justRecorded.title, justRecorded.body, esc) : ''}
    <div class="page-head"><div>
      <div class="recon-eyebrow"><a href="#/projects/${id}">Home</a> · <a href="#/projects/${id}/reconcile/overview">All areas</a></div>
      <h1>${esc(d.label)}</h1>
      <p>${d.signedOff ? 'Signed off.' : d.ready ? 'Every field is correct in live. Ready to sign off.'
        : d.tables.length ? `${num(d.open)} of ${num(d.tables.reduce((n, t) => n + t.fields.length, 0))} fields still open.` : 'No matched fields yet.'}</p>
    </div></div>

    <section class="card area-cells" aria-label="Where each step has got">${d.cells.map(cell).join('')}</section>

    ${d.todo.length ? `
      <h2 class="home-heading">What needs doing here</h2>
      <section class="card home-todo"><ol>${d.todo.map(t => `<li><span class="home-todo-text">${esc(t.text)}</span>
        <a class="btn btn-ghost btn-sm" href="#/projects/${id}/${t.path}">Open</a></li>`).join('')}</ol></section>` : ''}

    ${d.problems.length ? `
      <h2 class="home-heading">${esc(PROBLEMS_TEXT.areaHeading)} <span class="recon-sub">· ${num(d.problems.length)}</span></h2>
      <section class="card area-table">${problemsTable(id, d.problems, esc, { showArea: false })}
        <p class="recon-sub" style="margin:0.5rem 0 0"><a href="#/projects/${id}/problems">See every problem</a></p></section>` : ''}

    <h2 class="home-heading">Fields</h2>
    ${d.tables.length ? d.tables.map(t => `
      <section class="card area-table">
        <h3>${esc(t.name)} <span class="recon-sub">· ${num(t.fields.length)} ${t.fields.length === 1 ? 'field' : 'fields'}</span></h3>
        <div class="schema-preview"><table>
          <thead><tr><th scope="col">Field</th><th scope="col">Where it is</th><th scope="col">Latest note</th></tr></thead>
          <tbody>${t.fields.map(fieldRow).join('')}</tbody>
        </table></div>
      </section>`).join('') : `<section class="card"><p class="recon-sub">No fields in this area are matched yet. <a href="#/projects/${id}/map">Go to Match fields</a></p></section>`}
    <p class="recon-sub" style="margin:-0.5rem 0 1.25rem">To record a step for a field, open the <a href="#/projects/${id}/verify">field tracker</a>.</p>

    ${d.usesFileChecks && d.area ? `
      <h2 class="home-heading">File checks</h2>
      <section class="card">${fileCheckTable(id, d.area, esc)}</section>` : ''}

    <h2 class="home-heading">Sign-off</h2>
    <section class="card area-signoff">
      <p>${esc(AREA_TEXT.signHelp)}</p>
      <p class="recon-sub">Service area manager: ${manager ? `<strong>${esc(manager)}</strong>` : 'not set yet'} · <a href="#/projects/${id}/settings#settings-areas-card">Change in Project settings</a></p>
      ${d.signoffs.length ? `<ul class="area-signoffs">${d.signoffs.map(s => `<li><strong>${esc(s.role)}</strong> by ${esc(s.name)} · ${esc(fmt(s.at))}${s.note ? ` · ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : ''}
      ${!d.area ? `<p class="recon-sub">${esc(AREA_TEXT.nothing)}</p>` : `
        ${d.ready || d.signedOff ? '' : `<p class="alert alert-warn shot-warning">${esc(AREA_TEXT.notReady)}</p>`}
        <form class="recon-review-form" id="area-signoff-form" novalidate>
          <div class="field"><label for="signoff-name">Name</label><input id="signoff-name" name="name" value="${esc(userName)}" autocomplete="name"></div>
          <div class="field"><label>Recording<select name="role"><option>Signed off</option><option>Not signed off</option></select></label></div>
          <div class="field" style="flex:2"><label>Note (optional)<input name="note" placeholder="For example: checked in live with the service team"></label></div>
          <button class="btn btn-primary" type="submit">Record</button>
        </form>`}
    </section>
  `);
  ui.attachLogout();

  document.getElementById('area-signoff-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const who = String(fd.get('name') || '').trim();
    if (showErrors(e.target, requiredErrors([{ id: 'signoff-name', value: who, text: GOVUK_TEXT.enterName }]))) return;
    const p = getProject(id);
    const ov = projectOverview(p, p.reconRuns || [], { finalRunId: p.reconFinalRunId || null, signoffs: p.reconAreaSignoffs || [] });
    const a = ov.areas.find(x => x.name === name);
    if (!a) return;
    const signoff = buildAreaSignoff(a, { name: who, role: fd.get('role'), note: String(fd.get('note') || '').trim() });
    p.reconAreaSignoffs = [...(p.reconAreaSignoffs || []), signoff];
    // One sign-off for the area marks every field in it as signed off.
    const changed = signoff.role === 'Signed off' ? signOffAreaFields(p, a, { by: who, at: signoff.at }) : 0;
    saveProject(p);
    const signed = signoff.role === 'Signed off';
    const body = signed
      ? `${who} signed off ${name}.${changed ? ` ${num(changed)} ${changed === 1 ? 'field is' : 'fields are'} now marked as signed off.` : ''}`
      : `${who} recorded that ${name} is not signed off yet.`;
    renderArea({ id, area }, ui, { justRecorded: { title: signed ? GOVUK_TEXT.signedTitle : GOVUK_TEXT.notSignedTitle, body } });
    window.scrollTo(0, 0);
  });
}
