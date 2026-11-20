// The executive overview page. See executive.js for how it is worked out.

import { getProject } from './store.js';
import { getCurrentUser } from './auth.js';
import { buildExportPackage, evidenceDigest } from './export.js';
import { executiveSummary, EXEC_TEXT } from './executive.js';
import { areaPath } from './area-page.js';
import { oldName, newName } from './words.js';

const num = n => Number(n).toLocaleString('en-GB');
const when = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function renderExecutive({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const user = getCurrentUser();
  const evidenceChanged = Boolean(project.lastEvidenceExportAt)
    && project.lastEvidenceDigest !== evidenceDigest(buildExportPackage(project, user));
  const e = executiveSummary(project, { evidenceChanged });
  const r = e.readiness;
  const t = e.tiles;

  const tile = (big, label, sub, tone = '') => `
    <div class="exec-tile ${tone ? `exec-tile-${tone}` : ''}"><b>${big}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;

  const maxIssues = Math.max(1, ...e.trend.map(x => x.serious + x.smaller));
  const pf = e.proof;
  const testingLine = pf.problemsFound
    ? `<p class="exec-line"><strong>${num(pf.problemsFound)}</strong> ${pf.problemsFound === 1 ? 'problem' : 'problems'} found in testing: <strong>${num(pf.problemsFixed)}</strong> fixed, <strong>${num(pf.problemsOpen)}</strong> open.</p>
       <span class="exec-mini exec-mini-wide" role="img" aria-label="${num(pf.problemsFixed)} of ${num(pf.problemsFound)} fixed"><span style="width:${(pf.problemsFixed / pf.problemsFound) * 100}%"></span></span>`
    : '<p class="recon-sub">No problems found in testing yet.</p>';
  const trend = testingLine + (e.trend.length ? `
    <h3 class="exec-sub-h">File comparisons</h3>
    <ol class="exec-trend">${e.trend.map(x => `
      <li><span class="exec-trend-label">${esc(x.label)}<small>${esc(day(x.at))}</small></span>
        <span class="exec-bar" role="img" aria-label="${x.serious} serious, ${x.smaller} smaller">
          <span class="exec-bar-serious" style="width:${(x.serious / maxIssues) * 100}%"></span><span class="exec-bar-smaller" style="width:${(x.smaller / maxIssues) * 100}%"></span>
        </span>
        <span class="exec-trend-n"><strong>${num(x.serious)}</strong> serious · ${num(x.smaller)} smaller</span></li>`).join('')}
    </ol>
    <p class="exec-line">${esc(e.trendLine)}</p>
    <p class="exec-key"><span class="exec-dot exec-dot-serious"></span>Serious <span class="exec-dot exec-dot-smaller"></span>Smaller</p>` : '');

  const risks = e.risks.length ? `
    <ol class="exec-risks">${e.risks.map(x => `
      <li><p>${esc(x.text)}</p><p class="recon-sub">${esc(x.why)}${x.area ? ` Owner: ${esc(x.area)}.` : ''}</p></li>`).join('')}</ol>
    ${e.moreRisks ? `<p class="recon-sub">And ${num(e.moreRisks)} more. See the problems log and the latest file comparison for all of them.</p>` : ''}`
    : '<p class="exec-none">Nothing serious is open.</p>';

  const areaRows = e.areas.map(a => `
    <tr>
      <td><a href="${areaPath(id, a.name)}"><strong>${esc(a.name)}</strong></a>${a.manager ? `<small>${esc(a.manager)}</small>` : ''}</td>
      <td><span class="exec-pill exec-pill-${a.rag}">${esc(a.ragLabel)}</span></td>
      <td>${a.fieldsTotal ? `<span class="exec-mini"><span style="width:${(a.fieldsDone / a.fieldsTotal) * 100}%"></span></span>${num(a.fieldsDone)} of ${num(a.fieldsTotal)}` : '—'}</td>
      <td>${a.signedBy ? `✓ ${esc(a.signedBy)}` : esc(a.next || a.now)}</td>
    </tr>`).join('');

  const p = e.proof;
  const proof = [
    p.fieldsTotal ? `${num(p.fieldsDone)} of ${num(p.fieldsTotal)} fields recorded as correct in live, each with who tested it and when.` : 'No fields matched yet.',
    p.problemsFound ? `${num(p.problemsFound)} testing ${p.problemsFound === 1 ? 'problem' : 'problems'} logged: ${num(p.problemsFixed)} fixed, ${num(p.problemsOpen)} open.` : 'No testing problems logged.',
    p.areasTotal ? `${num(p.areasSigned)} of ${num(p.areasTotal)} ${p.areasTotal === 1 ? 'area' : 'areas'} signed off by name.` : 'No areas yet.',
    ...(p.checks ? [
      `${num(p.checks)} file ${p.checks === 1 ? 'comparison' : 'comparisons'}${p.lastCheck ? `, the latest ${esc(p.lastCheck.label)} on ${esc(day(p.lastCheck.at))}` : ''}.`
        + (p.finalLoad ? ` Final load chosen: ${esc(p.finalLoad.label)}.` : ''),
    ] : []),
    p.evidenceAt
      ? `Evidence pack downloaded ${esc(when(p.evidenceAt))}.${p.evidenceChanged ? ' <strong class="exec-warn">The project has changed since then.</strong>' : ''}`
      : 'Evidence pack not downloaded yet.',
  ];

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'executive')}
    <article class="exec">
      <header class="exec-head">
        <div>
          <div class="recon-eyebrow">${esc(EXEC_TEXT.title)}</div>
          <h1>${esc(project.name)}</h1>
          <p class="recon-meta">Moving from ${esc(oldName(project))} to ${esc(newName(project))} · as at ${esc(when(new Date().toISOString()))}</p>
        </div>
        <button class="btn btn-primary btn-sm no-print" id="exec-print">Print or save as PDF</button>
      </header>

      <section class="exec-ready exec-ready-${r.tone}" aria-labelledby="exec-ready-label">
        <div class="exec-ready-eyebrow">Are we ready?</div>
        <h2 id="exec-ready-label">${esc(r.label)}</h2>
        <p>${esc(r.reason)}</p>
        ${r.left.length ? `<p class="exec-ready-left">Also: ${esc(r.left.join(' '))}</p>` : ''}
      </section>

      <section class="exec-tiles" aria-label="Key figures">
        ${tile(t.fieldsDone.total ? `${num(t.fieldsDone.done)}<i> of ${num(t.fieldsDone.total)}</i>` : '—', 'fields correct in live',
          t.fieldsDone.total ? (t.fieldsDone.done ? `${t.fieldsDone.pct}%` : 'None yet') : 'Nothing matched yet', t.fieldsDone.total && t.fieldsDone.done === t.fieldsDone.total ? 'green' : '')}
        ${tile(t.fieldsTested.total ? `${num(t.fieldsTested.done)}<i> of ${num(t.fieldsTested.total)}</i>` : '—', 'fields passed in test',
          t.fieldsTested.total ? '' : 'Nothing matched yet', t.fieldsTested.total && t.fieldsTested.done === t.fieldsTested.total ? 'green' : '')}
        ${tile(num(t.open.total), 'problems open',
          t.latestMatch ? `${num(t.open.testing)} from testing · ${num(t.open.files)} from file comparisons` : '', t.open.total ? 'red' : 'green')}
        ${tile(`${num(t.signed.done)}<i> of ${num(t.signed.total)}</i>`, 'areas signed off', '', t.signed.total && t.signed.done === t.signed.total ? 'green' : '')}
      </section>

      <div class="exec-two">
        <section class="exec-card">
          <h2>Is it getting better?</h2>
          ${trend}
        </section>
        <section class="exec-card">
          <h2>Top risks</h2>
          ${risks}
        </section>
      </div>

      <section class="exec-card">
        <h2>Where each area is</h2>
        ${e.areas.length ? `<div class="schema-preview"><table class="exec-areas">
          <thead><tr><th>Area</th><th>Status</th><th>Fields correct in live</th><th>Next, or signed by</th></tr></thead>
          <tbody>${areaRows}</tbody></table></div>` : '<p class="recon-sub">No areas yet.</p>'}
      </section>

      <section class="exec-card">
        <h2>What is the evidence?</h2>
        <ul class="exec-proof">${proof.map(x => `<li>${x}</li>`).join('')}</ul>
        <p class="no-print"><a class="btn btn-ghost btn-sm" href="#/projects/${id}/export">Go to the evidence pack</a>
          <a class="btn btn-ghost btn-sm" href="#/projects/${id}/reconcile/overview">See all areas in detail</a></p>
      </section>

      <p class="exec-foot">${esc(EXEC_TEXT.notDecide)} No AI is used in any figure on this page.</p>
    </article>
  `);
  ui.attachLogout();
  document.getElementById('exec-print').addEventListener('click', () => window.print());
}
