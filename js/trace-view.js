// The "link the screen names to the real fields" card on the field lists
// screen. See trace.js for the logic and the rules it keeps.

import { getProject, saveProject, uid } from './store.js';
import { getCurrentUser } from './auth.js';
import { downloadText } from './export.js';
import {
  TRACE_TEXT, STATUS, buildTraceScript, parseTraceResults, combineRuns, traceReviewRows,
  applyLinks, traceSummary, screenTables, screenLabel,
} from './trace.js';

const num = n => Number(n).toLocaleString('en-GB');
let esc = v => String(v);

// Ticks and choices while reviewing, per project. Rebuilt when results change.
const review = new Map();

function rowsFor(project) {
  const runs = project.traceRuns || [];
  const key = runs.map(r => r.id).join(',') + '|' + JSON.stringify(screenTables(project.sourceSchema).map(t => t.columns.map(c => c.link ? 1 : 0)));
  const held = review.get(project.id);
  if (held?.key === key) return held.rows;
  const rows = traceReviewRows(project.sourceSchema, combineRuns(runs));
  review.set(project.id, { key, rows });
  return rows;
}

function lastResult(project) {
  const r = project.traceResult;
  if (!r || r.hidden) return '';
  const sum = traceSummary(r.counts);
  const when = new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <section class="card template-result" id="trace-result" role="status" tabindex="-1">
      <div class="recon-eyebrow">Links made · ${esc(when)}</div>
      <h2 class="template-result-title">${esc(sum.title)}</h2>
      <div class="template-result-grid">
        <div><b>${num(r.counts.linkedTotal)}</b><span>names linked in all</span></div>
        <div><b>${num(r.counts.several)}</b><span>found in more than one place</span></div>
        <div><b>${num(r.counts.none)}</b><span>not found</span></div>
        <div><b>${num(r.counts.notYet)}</b><span>not looked for yet</span></div>
      </div>
      <ul class="shot-detail">${sum.detail.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
      <p class="template-result-next"><strong>What to do next:</strong> ${esc(sum.next)}</p>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <a class="btn btn-primary btn-sm" href="#/projects/${project.id}/map">Go to the Match screen</a>
        <button class="btn btn-ghost btn-sm result-hide" id="trace-result-hide">Hide this</button>
      </div>
    </section>`;
}

export function traceCard(project, escapeHtml) {
  if (escapeHtml) esc = escapeHtml;
  const screens = screenTables(project.sourceSchema);
  if (!screens.length) {
    return `
    <details class="card template-import trace-card" id="trace-card">
      <summary><strong>${esc(TRACE_TEXT.title)}</strong>
        <span class="recon-sub" style="display:inline"> Uses a record you know and the old database.</span></summary>
      <p class="recon-sub" style="margin:0.75rem 0 0">${esc(TRACE_TEXT.empty)}</p>
    </details>`;
  }
  const runs = project.traceRuns || [];
  const options = screens.map((t, i) => {
    const left = t.columns.filter(c => !c.link).length;
    return `<option value="${i}">${esc(screenLabel(t.name))} (${num(left)} not linked)</option>`;
  }).join('');
  return `
    ${lastResult(project)}
    <details class="card template-import trace-card" id="trace-card" ${runs.length ? 'open' : ''}>
      <summary><strong>${esc(TRACE_TEXT.title)}</strong>
        <span class="recon-sub" style="display:inline"> Uses a record you know and the old database.</span></summary>
      <p class="recon-sub" style="margin:0.75rem 0">${esc(TRACE_TEXT.lead)}</p>
      <ol class="trace-steps">
        <li>${esc(TRACE_TEXT.step1)}</li><li>${esc(TRACE_TEXT.step2)}</li><li>${esc(TRACE_TEXT.step3)}</li><li>${esc(TRACE_TEXT.step4)}</li>
      </ol>
      <div class="alert alert-info shot-warning" role="note">${esc(TRACE_TEXT.privacy)}</div>
      <div class="trace-row">
        <label for="trace-screen"><strong>1.</strong> Screen</label>
        <select id="trace-screen"><option value="all">All screens</option>${options}</select>
        <button class="btn btn-secondary btn-sm" id="trace-script">Download the search script (.sql)</button>
      </div>
      <div class="trace-row">
        <label for="trace-files"><strong>4.</strong> Results</label>
        <input type="file" id="trace-files" accept=".csv,text/csv" multiple>
      </div>
      ${runs.length ? `<ul class="trace-runs">${runs.map(r => `
        <li>${esc(r.file)} · ${num(r.rows.length)} lines · ${esc(new Date(r.at).toLocaleDateString('en-GB'))}
          <button class="btn-link trace-remove" data-id="${esc(r.id)}" aria-label="Remove ${esc(r.file)}">Remove</button></li>`).join('')}</ul>` : ''}
      ${project.traceResult?.hidden ? '<p style="margin-top:0.6rem"><button class="btn-link" id="trace-result-show">Show the last result</button></p>' : ''}
      <div id="trace-msg" aria-live="polite"></div>
      <div id="trace-review"></div>
    </details>`;
}

export function bindTrace(projectId, ui, rerender) {
  const card = document.getElementById('trace-card');
  document.getElementById('trace-result-show')?.addEventListener('click', () => {
    const p = getProject(projectId);
    if (p.traceResult) { delete p.traceResult.hidden; saveProject(p); }
    rerender();
    document.getElementById('trace-result')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  document.getElementById('trace-result-hide')?.addEventListener('click', () => {
    const p = getProject(projectId);
    if (p.traceResult) { p.traceResult.hidden = true; saveProject(p); }
    rerender();
  });
  if (!card || !document.getElementById('trace-script')) return; // empty card: nothing to bind
  const msg = document.getElementById('trace-msg');
  const reviewEl = document.getElementById('trace-review');
  const say = (text, bad = false) => { msg.innerHTML = text ? `<p class="${bad ? 'recon-error' : 'recon-sub'}" style="margin-top:0.6rem">${esc(text)}</p>` : ''; };

  document.getElementById('trace-script').addEventListener('click', () => {
    const p = getProject(projectId);
    const screens = screenTables(p.sourceSchema);
    const pick = document.getElementById('trace-screen').value;
    const chosen = pick === 'all' ? screens : [screens[Number(pick)]];
    try {
      const sql = buildTraceScript(chosen, { project: p.name });
      const slug = (pick === 'all' ? 'all-screens' : screenLabel(chosen[0].name)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      downloadText(sql, `mapbridge-search-${slug}.sql`, 'application/sql');
      say('Script downloaded. Fill in the values from one record, run it, and save the results as a CSV file.');
    } catch (err) {
      say(err.message, true);
    }
  });

  document.getElementById('trace-files').addEventListener('change', async e => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    if (typeof Papa === 'undefined') { say('The CSV reader did not load. Check your connection and reload.', true); return; }
    const p = getProject(projectId);
    const screens = new Set(screenTables(p.sourceSchema).map(t => screenLabel(t.name)));
    const added = [];
    const problems = [];
    for (const file of files) {
      try {
        const rows = parseTraceResults(Papa.parse((await file.text()).replace(/^﻿/, ''), { skipEmptyLines: true }).data);
        const unknown = [...new Set(rows.map(r => r.screen).filter(s => !screens.has(s)))];
        if (unknown.length === new Set(rows.map(r => r.screen)).size) throw new Error(`None of its screens are in the list here (${unknown.slice(0, 3).join(', ')}). Was a screen renamed?`);
        // Only names and counts are kept: the results hold no record values.
        p.traceRuns = [...(p.traceRuns || []), { id: uid(), file: file.name, at: new Date().toISOString(), rows }];
        added.push(file.name);
      } catch (err) {
        problems.push(`${file.name}: ${err.message}`);
      }
    }
    saveProject(p);
    review.delete(projectId);
    rerender();
    const m = document.getElementById('trace-msg');
    if (m) m.innerHTML = [
      added.length ? `<p class="recon-sub" style="margin-top:0.6rem">Added ${num(added.length)} results ${added.length === 1 ? 'file' : 'files'}.</p>` : '',
      problems.length ? `<ul class="recon-error shot-notes">${problems.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
    ].join('');
  });

  card.querySelectorAll('.trace-remove').forEach(b => b.addEventListener('click', () => {
    const p = getProject(projectId);
    p.traceRuns = (p.traceRuns || []).filter(r => r.id !== b.dataset.id);
    saveProject(p);
    review.delete(projectId);
    rerender();
  }));

  renderReview();

  function renderReview() {
    const p = getProject(projectId);
    if (!(p.traceRuns || []).length) { reviewEl.innerHTML = ''; return; }
    const all = rowsFor(p);
    const shown = all.filter(r => !r.linked && r.status !== 'skipped');
    const linkedCount = all.filter(r => r.linked).length;
    const several = shown.filter(r => r.status === 'several').length;
    if (!shown.length) {
      reviewEl.innerHTML = `<div class="template-found"><p><strong>Nothing to check.</strong> ${linkedCount ? `${num(linkedCount)} names are linked already.` : 'No name in these results matches a screen name here.'}</p></div>`;
      return;
    }
    reviewEl.innerHTML = `
      <div class="template-found">
        <p><strong>${num(shown.length)} names to check.</strong> ${linkedCount ? `${num(linkedCount)} are linked already. ` : ''}Pick the real field for each, tick it and press Link.</p>
        ${several ? `<p class="recon-sub">${esc(TRACE_TEXT.severalHelp)}</p>` : ''}
        <div class="schema-preview"><table class="shot-table trace-table">
          <thead><tr><th scope="col"><span class="sr-only">Link</span></th><th scope="col">Screen</th><th scope="col">Name on screen</th><th scope="col">What was found</th><th scope="col">Real field</th></tr></thead>
          <tbody>${shown.map(r => `
            <tr data-id="${esc(r.id)}" class="trace-${r.status}">
              <td>${r.candidates.length ? `<input type="checkbox" class="trace-tick" aria-label="Link ${esc(r.label)}" ${r.ticked ? 'checked' : ''}>` : ''}</td>
              <td>${esc(r.screen)}</td>
              <td>${esc(r.label)}</td>
              <td><span class="trace-status">${esc(STATUS[r.status])}</span><br><span class="recon-sub">${num(r.runs)} ${r.runs === 1 ? 'record' : 'records'}</span></td>
              <td>${r.candidates.length ? `<select class="trace-choice" aria-label="Real field for ${esc(r.label)}">${r.candidates.map((c, i) => `
                <option value="${i}" ${i === r.choice ? 'selected' : ''}>${esc(c.table)}.${esc(c.column)} · ${num(c.rows)} ${c.rows === 1 ? 'row' : 'rows'}${c.sameTable ? ' · same table as other names' : ''}</option>`).join('')}</select>`
                : `<span class="recon-sub">${r.status === 'conflict' ? 'Each record was found in a different place. Check the values typed.' : 'Not found. It may be worked out from other fields, or written another way.'}</span>`}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="recon-sub" id="trace-count" style="margin-top:0.5rem"></p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">
          <button class="btn btn-primary btn-sm" id="trace-apply">Link the ticked names</button>
          <button class="btn btn-secondary btn-sm" id="trace-tick-sure">Tick the ones found in one place</button>
          <button class="btn btn-ghost btn-sm" id="trace-untick">Untick all</button>
        </div>
      </div>`;

    const byId = id => shown.find(r => r.id === id);
    const count = () => {
      const n = shown.filter(r => r.ticked).length;
      document.getElementById('trace-count').textContent = `${num(n)} ticked.`;
      document.getElementById('trace-apply').disabled = !n;
    };
    reviewEl.querySelectorAll('tbody tr').forEach(tr => {
      const row = byId(tr.dataset.id);
      tr.querySelector('.trace-tick')?.addEventListener('change', e => { row.ticked = e.target.checked; count(); });
      tr.querySelector('.trace-choice')?.addEventListener('change', e => { row.choice = Number(e.target.value); });
    });
    document.getElementById('trace-tick-sure').onclick = () => { shown.forEach(r => { r.ticked = r.ticked || r.status === 'one'; }); renderReview(); };
    document.getElementById('trace-untick').onclick = () => { shown.forEach(r => { r.ticked = false; }); renderReview(); };
    document.getElementById('trace-apply').onclick = apply;
    count();
  }

  function apply() {
    const p = getProject(projectId);
    const rows = rowsFor(p);
    const user = getCurrentUser();
    const { schema, linked, addedColumns } = applyLinks(p.sourceSchema, rows, { by: user?.name || '' });
    p.sourceSchema = schema;
    const after = traceReviewRows(schema, combineRuns(p.traceRuns || []));
    const open = after.filter(r => !r.linked);
    p.traceResult = {
      at: new Date().toISOString(),
      counts: {
        files: (p.traceRuns || []).length,
        records: Math.max(0, ...after.map(r => r.runs)),
        linked, addedColumns,
        linkedTotal: after.filter(r => r.linked).length,
        waiting: open.filter(r => ['one', 'likely'].includes(r.status)).length,
        several: open.filter(r => r.status === 'several').length,
        none: open.filter(r => ['none', 'conflict'].includes(r.status)).length,
        notYet: open.filter(r => r.status === 'skipped').length,
      },
    };
    saveProject(p);
    review.delete(projectId);
    ui.toast(linked ? `Linked ${num(linked)} names` : 'Nothing was linked');
    rerender();
    const result = document.getElementById('trace-result');
    result?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    result?.focus({ preventScroll: true });
  }
}
