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
  const trend = e.trend.length ? `
    <ol class="exec-trend">${e.trend.map(x => `
      <li><span class="exec-trend-label">${esc(x.label)}<small>${esc(day(x.at))}</small></span>
        <span class="exec-bar" role="img" aria-label="${x.serious} serious, ${x.smaller} smaller">
          <span class="exec-bar-serious" style="width:${(x.serious / maxIssues) * 100}%"></span><span class="exec-bar-smaller" style="width:${(x.smaller / maxIssues) * 100}%"></span>
        </span>
        <span class="exec-trend-n"><strong>${num(x.serious)}</strong> serious · ${num(x.smaller)} smaller</span></li>`).join('')}
    </ol>
    <p class="exec-line">${esc(e.trendLine)}</p>
    <p class="exec-key"><span class="exec-dot exec-dot-serious"></span>Serious <span class="exec-dot exec-dot-smaller"></span>Smaller</p>`
    : '<p class="recon-sub">No loads have been checked yet.</p>';

  const risks = e.risks.length ? `
    <ol class="exec-risks">${e.risks.map(x => `
      <li><p>${esc(x.text)}</p><p class="recon-sub">${esc(x.why)}${x.area ? ` Owner: ${esc(x.area)}.` : ''}</p></li>`).join('')}</ol>
    ${e.moreRisks ? `<p class="recon-sub">And ${num(e.moreRisks)} more. See the latest check for all of them.</p>` : ''}`
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
    `${num(p.checks)} ${p.checks === 1 ? 'load' : 'loads'} checked${p.lastCheck ? `, the latest ${esc(p.lastCheck.label)} on ${esc(day(p.lastCheck.at))}` : ''}.`,
    p.finalLoad ? `Final load chosen: ${esc(p.finalLoad.label)}.` : 'No final load chosen yet.',
    p.problemsFound ? `${num(p.problemsFound)} UAT ${p.problemsFound === 1 ? 'problem' : 'problems'} logged: ${num(p.problemsFixed)} fixed, ${num(p.problemsOpen)} open.` : 'No UAT problems logged.',
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
        ${tile(t.latestMatch ? `${t.latestMatch.pct}%` : '—', 'details matched in the latest check',
          t.latestMatch ? `${t.latestMatch.totals.agreed} of ${t.latestMatch.totals.checked} totals agree` : 'No check yet')}
        ${tile(num(t.serious.open), 'serious problems open', `${num(t.serious.smaller)} smaller`, t.serious.open ? 'red' : 'green')}
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
        <h2>Can we prove it?</h2>
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
