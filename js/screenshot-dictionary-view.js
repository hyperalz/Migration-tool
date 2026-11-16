// The "screenshot dictionary" card on the field lists screen. See
// screenshot-dictionary.js for the logic and the rules it keeps.

import { getProject, saveProject } from './store.js';
import { getAISettings } from './ai-suggestions.js';
import { mergeSchema } from './template-import.js';
import {
  SHOT_TEXT, KINDS, MAX_FILES, SCREEN_PREFIX, fitSize, dropDuplicates, missingKey, askAI, isLocalAddress, isCloudModel, cleanScreenName,
  parseScreenReply, reviewRows, screenshotSchema, shotSummary,
} from './screenshot-dictionary.js';

const num = n => Number(n).toLocaleString('en-GB');
let esc = v => String(v);

// Results waiting for review. Text only, in memory, per project. Never images.
const pending = new Map();
// Fingerprints of pictures already sent while this page is open, so a copy is not sent twice.
const sentHashes = new Set();

function lastResult(project) {
  const s = project?.screenshotImport;
  if (!s || s.hidden) return '';
  const sum = shotSummary(s.counts);
  const when = new Date(s.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <section class="card template-result" id="shot-result" role="status" tabindex="-1">
      <div class="recon-eyebrow">Screenshots read · ${esc(when)}</div>
      <h2 class="template-result-title">${esc(sum.title)}</h2>
      <div class="template-result-grid">
        <div><b>${num(s.counts.pictures)}</b><span>pictures read</span></div>
        <div><b>${num(s.counts.found)}</b><span>names found</span></div>
        <div><b>${num(s.counts.added)}</b><span>names added</span></div>
        <div><b>${num(s.counts.leftOut + s.counts.failed)}</b><span>left out or not read</span></div>
      </div>
      <ul class="shot-detail">${sum.detail.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
      <p class="template-result-next"><strong>What to do next:</strong> ${esc(sum.next)}</p>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <a class="btn btn-primary btn-sm" href="#/projects/${project.id}/map">Go to the Match screen</a>
        <button class="btn btn-ghost btn-sm result-hide" id="shot-result-hide">Hide this</button>
      </div>
    </section>`;
}

export function screenshotCard(project, escapeHtml) {
  if (escapeHtml) esc = escapeHtml;
  const settings = getAISettings();
  const noKey = missingKey(settings);
  const cloud = isLocalAddress(settings.baseURL) && isCloudModel(settings.model);
  return `
    ${lastResult(project)}
    <details class="card template-import shot-dict" id="shot-dict" ${pending.has(project.id) ? 'open' : ''}>
      <summary><strong>${esc(SHOT_TEXT.title)}</strong>
        <span class="recon-sub" style="display:inline"> Make a list of its fields from pictures of its screens.</span></summary>
      <p class="recon-sub" style="margin:0.75rem 0">${esc(SHOT_TEXT.lead)}</p>
      <div class="alert alert-warn shot-warning" role="note"><strong>Before you send:</strong> ${esc(SHOT_TEXT.warning)}</div>
      ${cloud ? `<div class="alert alert-warn shot-warning" role="note" id="shot-cloud"><strong>${esc(settings.model)}:</strong> ${esc(SHOT_TEXT.cloudModel)}</div>` : ''}
      <p class="recon-sub" style="margin:0.5rem 0 0.75rem">${esc(SHOT_TEXT.notStored)}</p>
      ${noKey ? `
        <p class="recon-error" id="shot-no-key">${esc(SHOT_TEXT.noKey)}</p>
        <button class="btn btn-secondary btn-sm" id="shot-open-settings">Open the AI settings</button>` : `
        <input type="file" id="shot-files" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple>
        <label class="shot-agree"><input type="checkbox" id="shot-agree"> ${esc(SHOT_TEXT.agree)}</label>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">
          <button class="btn btn-primary btn-sm" id="shot-send" disabled>Send to the AI and read the names</button>
          <button class="btn btn-ghost btn-sm" id="shot-settings-link">AI settings</button>
        </div>`}
      <div id="shot-progress" aria-live="polite"></div>
      <div id="shot-review"></div>
    </details>`;
}

// Draw the picture smaller in the browser and return it as a data URL.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function fingerprint(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function bindScreenshotDictionary(projectId, ui, rerender) {
  const openSettings = () => ui.openAISettings?.(() => rerender(), { showKey: true });
  document.getElementById('shot-open-settings')?.addEventListener('click', openSettings);
  document.getElementById('shot-settings-link')?.addEventListener('click', openSettings);
  document.getElementById('shot-result-hide')?.addEventListener('click', () => {
    const p = getProject(projectId);
    if (p.screenshotImport) { p.screenshotImport.hidden = true; saveProject(p); }
    rerender();
  });

  const input = document.getElementById('shot-files');
  const agree = document.getElementById('shot-agree');
  const send = document.getElementById('shot-send');
  const progress = document.getElementById('shot-progress');
  const review = document.getElementById('shot-review');
  if (pending.has(projectId)) renderReview();
  if (!input) return;

  const ready = () => { send.disabled = !(agree.checked && input.files?.length); };
  input.addEventListener('change', ready);
  agree.addEventListener('change', ready);
  send.addEventListener('click', readAll);

  async function readAll() {
    const settings = getAISettings();
    if (missingKey(settings)) { progress.innerHTML = `<p class="recon-error">${esc(SHOT_TEXT.noKey)}</p>`; return; }
    const files = [...(input.files || [])];
    const notImages = files.filter(f => !/^image\//.test(f.type));
    let images = files.filter(f => /^image\//.test(f.type));
    const tooMany = Math.max(0, images.length - MAX_FILES);
    images = images.slice(0, MAX_FILES);
    send.disabled = true;
    input.disabled = true;

    const hashed = [];
    for (const file of images) hashed.push({ file, hash: await fingerprint(file) });
    const { keep, duplicates } = dropDuplicates(hashed, sentHashes);

    const prev = pending.get(projectId);
    const results = prev?.results || [];
    const failures = [];
    for (let i = 0; i < keep.length; i++) {
      const { file, hash } = keep[i];
      progress.innerHTML = `<p class="recon-sub" style="margin-top:0.75rem">Reading picture ${i + 1} of ${keep.length}: ${esc(file.name)}…</p>`;
      try {
        let dataUrl = await shrink(file);
        const reply = await askAI(dataUrl, settings);
        dataUrl = null; // the picture is not kept
        results.push({ file: file.name, ...parseScreenReply(reply) });
        sentHashes.add(hash);
      } catch (err) {
        failures.push({ file: file.name, message: err.message || 'Something went wrong.' });
        if (/key|address|model|reach/i.test(err.message || '')) break; // a settings problem will fail every picture
      }
    }

    const counts = {
      pictures: (prev?.counts.pictures || 0) + keep.length - failures.length,
      duplicates: (prev?.counts.duplicates || 0) + duplicates.length,
      failed: (prev?.counts.failed || 0) + failures.length,
      removed: results.reduce((n, r) => n + (r.removed || 0), 0),
    };
    pending.set(projectId, { results, counts, rows: reviewRows(results, getProject(projectId).sourceSchema) });
    input.value = '';
    input.disabled = false;
    agree.checked = false;
    ready();

    const notes = [
      notImages.length ? `${num(notImages.length)} ${notImages.length === 1 ? 'file was' : 'files were'} not a picture, so ${notImages.length === 1 ? 'it was' : 'they were'} skipped.` : '',
      tooMany ? `Only ${MAX_FILES} pictures can be read at a time. Add the other ${num(tooMany)} next.` : '',
      duplicates.length ? `${num(duplicates.length)} ${duplicates.length === 1 ? 'picture was a copy' : 'pictures were copies'}, so ${duplicates.length === 1 ? 'it was' : 'they were'} not sent.` : '',
      ...failures.map(f => `${f.file}: ${f.message}`),
    ].filter(Boolean);
    progress.innerHTML = notes.length
      ? `<ul class="shot-notes ${failures.length ? 'recon-error' : ''}">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    renderReview();
  }

  function renderReview() {
    const state = pending.get(projectId);
    if (!state) { review.innerHTML = ''; return; }
    const { rows } = state;
    if (!rows.length) {
      review.innerHTML = `<div class="template-found"><p><strong>No names found yet.</strong> Try a clearer picture of a screen with boxes to fill in.</p>
        <button class="btn btn-ghost btn-sm" id="shot-discard">Clear</button></div>`;
      document.getElementById('shot-discard').onclick = discard;
      return;
    }
    const screens = new Set(rows.map(r => r.table)).size;
    // The screen name can be edited once per screen, on its first row.
    const firstOfScreen = new Set();
    const seenKeys = new Set();
    for (const r of rows) if (!seenKeys.has(r.screenKey)) { seenKeys.add(r.screenKey); firstOfScreen.add(r.id); }
    review.innerHTML = `
      <div class="template-found shot-review">
        <p><strong>Found ${num(rows.length)} names on ${num(screens)} ${screens === 1 ? 'screen' : 'screens'}.</strong> ${esc(SHOT_TEXT.reviewHelp)}</p>
        ${state.counts.removed ? `<p class="alert alert-warn shot-warning" role="note">${esc(SHOT_TEXT.removedNote)}</p>` : ''}
        <div class="schema-preview"><table class="shot-table">
          <thead><tr><th scope="col"><span class="sr-only">Keep</span></th><th scope="col">Screen</th><th scope="col">Name on screen</th><th scope="col">Kind</th><th scope="col">Choices seen</th><th scope="col">Must fill in?</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr class="${r.already ? 'shot-already' : ''}" data-id="${esc(r.id)}">
              <td>${r.already ? '<span class="recon-sub">In the list</span>'
                : `<input type="checkbox" class="shot-tick" aria-label="Keep ${esc(r.label)}" ${r.ticked ? 'checked' : ''}>`}</td>
              <td>${firstOfScreen.has(r.id)
                ? `<input type="text" class="shot-screen" value="${esc(r.table.slice(SCREEN_PREFIX.length))}" aria-label="Screen name" data-key="${esc(r.screenKey)}">`
                : `<span class="recon-sub">${esc(r.table.slice(SCREEN_PREFIX.length))}</span>`}</td>
              <td><input type="text" class="shot-label" value="${esc(r.label)}" aria-label="Name on screen" ${r.already ? 'disabled' : ''}></td>
              <td><select class="shot-kind" aria-label="Kind of value" ${r.already ? 'disabled' : ''}>${KINDS.map(k => `<option ${k === r.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
              <td>${esc(r.options.join(', ') || '—')}</td>
              <td>${r.required ? 'Looks like it' : '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="recon-sub" id="shot-count" style="margin-top:0.5rem"></p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">
          <button class="btn btn-primary btn-sm" id="shot-apply">Add the ticked names</button>
          <button class="btn btn-secondary btn-sm" id="shot-tick-all">Tick all</button>
          <button class="btn btn-ghost btn-sm" id="shot-untick-all">Untick all</button>
          <button class="btn btn-ghost btn-sm" id="shot-discard">Throw these away</button>
        </div>
      </div>`;

    const byId = id => rows.find(r => r.id === id);
    const count = () => {
      const n = rows.filter(r => r.ticked && !r.already).length;
      document.getElementById('shot-count').textContent = `${num(n)} ticked.`;
      document.getElementById('shot-apply').disabled = !n;
    };
    review.querySelectorAll('tbody tr').forEach(tr => {
      const row = byId(tr.dataset.id);
      tr.querySelector('.shot-tick')?.addEventListener('change', e => { row.ticked = e.target.checked; count(); });
      tr.querySelector('.shot-label')?.addEventListener('input', e => { row.label = e.target.value; });
      tr.querySelector('.shot-kind')?.addEventListener('change', e => { row.kind = e.target.value; });
    });
    review.querySelectorAll('.shot-screen').forEach(input => input.addEventListener('change', () => {
      const name = cleanScreenName(input.value).text || 'Unnamed screen';
      rows.forEach(r => { if (r.screenKey === input.dataset.key) r.table = SCREEN_PREFIX + name; });
      renderReview();
    }));
    const setAll = v => { rows.forEach(r => { if (!r.already) r.ticked = v; }); renderReview(); };
    document.getElementById('shot-tick-all').onclick = () => setAll(true);
    document.getElementById('shot-untick-all').onclick = () => setAll(false);
    document.getElementById('shot-discard').onclick = discard;
    document.getElementById('shot-apply').onclick = apply;
    count();
  }

  function discard() {
    pending.delete(projectId);
    progress.innerHTML = '';
    renderReview();
  }

  function apply() {
    const state = pending.get(projectId);
    if (!state) return;
    const p = getProject(projectId);
    const incoming = screenshotSchema(state.rows);
    const merged = mergeSchema(p.sourceSchema, incoming);
    const shotTables = new Set(incoming.tables.map(t => t.name));
    merged.schema.tables.forEach(t => { if (shotTables.has(t.name)) t.origin = 'screenshot'; });
    p.sourceSchema = { ...merged.schema, system: p.sourceSystem || merged.schema.system };

    const ticked = state.rows.filter(r => r.ticked && !r.already).length;
    p.screenshotImport = {
      at: new Date().toISOString(),
      screens: [...shotTables],
      counts: {
        ...state.counts,
        found: state.rows.length,
        added: merged.added,
        screens: incoming.tables.filter(t => t.columns.length).length,
        already: state.rows.filter(r => r.already).length + (ticked - merged.added),
        leftOut: state.rows.filter(r => !r.ticked && !r.already).length,
      },
    };
    saveProject(p);
    pending.delete(projectId);
    ui.toast(merged.added ? `Added ${num(merged.added)} names` : 'Nothing new to add');
    rerender();
    const result = document.getElementById('shot-result');
    result?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    result?.focus({ preventScroll: true });
  }
}
