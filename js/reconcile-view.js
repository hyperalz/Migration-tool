// Screens for checking a trial load and reading the readiness report.
// The checking itself lives in reconcile.js.

import { getProject, saveProject, createProject, uid } from './store.js';
import { getCurrentUser } from './auth.js';
import { oldName, newName } from './words.js';
import { defaultVerification } from './verification.js';
import { downloadCSV, downloadJSON } from './export.js';
import {
  tablePairs, guessKeyMappingIds, getColumn, isLikelyPersonal, isLikelyAmount,
  reconcilePair, buildRun, fingerprintRun, compareWithHistory, allGroups, exceptionRows,
  formatAmount, SEVERITY_LABEL,
  suggestKeyMappingIds,
} from './reconcile.js';
import { plainSummary } from './reconcile-plain.js';
import { projectOverview } from './reconcile-overview.js';
import { areaBoard, STAGES } from './work-queue.js';
import { areaPath } from './area-page.js';
import { boldLeadNumber, cellTone } from './figures.js';
import { COMPARE_TEXT, tableJourney, suggestedStage, runStage, asOldColumns } from './journey.js';
import {
  FINANCE_DEMO, legacyFinanceSchema, newFinanceSchema, financeMappings, financeKeys, financeDemoExtracts,
} from './demoFinance.js';

let esc = s => String(s);

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mapbridge';
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function num(n) {
  return Number(n).toLocaleString('en-GB');
}

function pct(rate) {
  if (rate === null || rate === undefined) return '—';
  // Never round up to 100% when something did not match.
  const p = Math.floor(rate * 1000) / 10;
  return `${p.toFixed(1)}%`;
}

function runs(project) {
  return project.reconRuns || [];
}

// ---------- demo project ----------

export function createFinanceDemoProject(user) {
  const project = createProject({
    name: 'Demo: finance system move',
    sourceSystem: legacyFinanceSchema.system,
    targetSystem: newFinanceSchema.system,
    ownerId: user.id,
  });
  project.demo = FINANCE_DEMO;
  project.sourceSchema = JSON.parse(JSON.stringify(legacyFinanceSchema));
  project.targetSchema = JSON.parse(JSON.stringify(newFinanceSchema));
  project.serviceAreas = [...new Set(financeMappings.map(m => m.serviceArea))].map(name => ({ id: uid(), name }));
  project.mappings = financeMappings.map(m => ({
    id: uid(),
    transformNotes: '',
    lookupRule: '',
    defaultValue: '',
    ...m,
    verification: defaultVerification('Demo match', user.name || 'demo'),
  }));
  seedDemoTesting(project, user);
  project.status = 'mapping';
  project.reconRuns = [];
  return saveProject(project);
}

// The demo shows a move part way through testing, the way most checking
// really happens: on screen, field by field. Ledger balances have passed in
// test and are now in live; two supplier fields failed in test.
function seedDemoTesting(project, user) {
  const me = user.name || 'Demo user';
  const day = n => new Date(Date.now() - n * 86400000).toISOString();
  const step = (m, status, by, daysAgo, note) => {
    m.verification.status = status;
    m.verification.history.push({ status, at: day(daysAgo), by, note, reference: '' });
  };
  for (const m of project.mappings) {
    m.verification.history[0].at = day(12);
    step(m, 'sql_sent', me, 10, 'Filled tables sent for loading');
    step(m, 'test_uploaded', 'Database team', 8, 'Loaded into test');
    if (m.targetTable === 'GL_Opening_Balance') {
      step(m, 'test_passed', 'Finance team', 6, 'Checked on screen');
      step(m, 'live_uploaded', 'Database team', 2, 'Loaded into live');
    } else if (m.targetColumn === 'STATUS' || m.targetColumn === 'BANK_SORT_CODE') {
      step(m, 'test_failed', 'Accounts payable team', 6,
        m.targetColumn === 'STATUS' ? 'Suppliers on hold show as inactive' : 'Some sort codes have lost their leading zero');
    } else {
      step(m, 'test_passed', 'Accounts payable team', 6, 'Checked on screen');
    }
  }
}

// ---------- running a check ----------

function unmappedTargetNotes(project, pairs) {
  const notes = [];
  for (const pair of pairs) {
    const table = project.targetSchema?.tables?.find(t => t.name === pair.targetTable);
    if (!table) continue;
    const mapped = new Set(pair.mappings.map(m => m.targetColumn));
    const unmapped = table.columns.filter(c => !mapped.has(c.name)).map(c => c.name);
    if (unmapped.length) {
      notes.push(`${pair.targetTable}: ${unmapped.length} new-system field${unmapped.length === 1 ? '' : 's'} with no match, so not checked (${unmapped.slice(0, 8).join(', ')}${unmapped.length > 8 ? ', …' : ''}).`);
    }
  }
  return notes;
}

async function executeRun(project, { label, inputs, stage = 'test' }) {
  const user = getCurrentUser();
  const pairs = tablePairs(project.mappings);
  const results = [];
  const notCovered = [];

  for (const pair of pairs) {
    const input = inputs[pair.id];
    if (!input?.sourceRows || !input?.targetRows) {
      notCovered.push(`${pair.sourceTable} → ${pair.targetTable}: no extracts supplied, so this table was not checked.`);
      continue;
    }
    results.push(reconcilePair({
      pair,
      sourceRows: input.sourceRows,
      targetRows: input.targetRows,
      keyMappingIds: input.keyMappingIds,
      maskedMappingIds: input.maskedMappingIds,
      totalMappingIds: input.totalMappingIds,
      sourceSchema: project.sourceSchema,
      targetSchema: project.targetSchema,
      sourceFile: input.sourceFile,
      targetFile: input.targetFile,
      alreadyTranslated: !!input.sourceTranslated,
    }));
  }
  if (!results.length) throw new Error('Add the old and new extract for at least one table.');

  notCovered.push(...unmappedTargetNotes(project, pairs.filter(p => results.some(r => r.id === p.id))));

  const run = buildRun({ project, label, by: user?.name || user?.email || 'unknown', pairResults: results, notCovered });
  run.stage = stage === 'live' ? 'live' : 'test';
  run.fingerprint = await fingerprintRun(run);

  const fresh = getProject(project.id);
  fresh.reconRuns = [...runs(fresh), run];
  saveProject(fresh);
  return run;
}

function demoInputs(project, load) {
  const extracts = financeDemoExtracts(load);
  const inputs = {};
  for (const pair of tablePairs(project.mappings)) {
    const ex = extracts[pair.id];
    if (!ex) continue;
    const keys = financeKeys[pair.id] || [];
    inputs[pair.id] = {
      ...ex,
      keyMappingIds: pair.mappings.filter(m => keys.includes(m.sourceColumn)).map(m => m.id),
      maskedMappingIds: pair.mappings.filter(m => ['contact_name', 'sort_code'].includes(m.sourceColumn)).map(m => m.id),
      totalMappingIds: pair.mappings
        .filter(m => isLikelyAmount(m, getColumn(project.sourceSchema, m.sourceTable, m.sourceColumn), getColumn(project.targetSchema, m.targetTable, m.targetColumn)))
        .map(m => m.id),
    };
  }
  return inputs;
}

function parseExtract(text) {
  if (typeof Papa === 'undefined') throw new Error('CSV reader did not load. Check your connection and reload.');
  if (!String(text).replace(/^\uFEFF/, '').trim()) throw new Error('This file is empty.');
  const parsed = Papa.parse(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => String(h).trim(),
  });
  const columns = (parsed.meta?.fields || []).filter(Boolean);
  if (!columns.length) throw new Error('No headings found in the first row of the file.');
  return { rows: parsed.data, columns };
}

// ---------- reconcile screen ----------

export function renderReconcile({ id }, ui) {
  esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';

  const pairs = tablePairs(project.mappings);
  // Held in memory only, and dropped when you leave this screen.
  const loaded = {};
  const keyTouched = {}; // pairs where the person chose the key themselves

  if (!pairs.length) {
    ui.mount(`
      ${ui.projectSteps(project, 'reconcile')}
      <div class="page-head"><div><h1>Compare files</h1><p>Match some fields first. Then you can compare what was meant to arrive in ${esc(newName(project))} with what did.</p></div></div>
      <div class="card empty-state"><p>Match some fields first. The agreed matches are the rule book for the checks.</p>
      <a class="btn btn-primary" style="margin-top:1rem" href="#/projects/${project.id}/map">Go to Match fields</a></div>`);
    ui.attachLogout();
    return;
  }

  const fieldRow = (pair, m, guessKeys) => {
    const sCol = getColumn(project.sourceSchema, m.sourceTable, m.sourceColumn);
    const tCol = getColumn(project.targetSchema, m.targetTable, m.targetColumn);
    const personal = isLikelyPersonal(sCol) || isLikelyPersonal(tCol) || isLikelyPersonal({ name: m.sourceColumn }) || isLikelyPersonal({ name: m.targetColumn });
    const amount = isLikelyAmount(m, sCol, tCol);
    const key = guessKeys.includes(m.id);
    return `
      <tr>
        <td><span class="recon-mono">${esc(m.sourceColumn)}</span> → <span class="recon-mono">${esc(m.targetColumn)}</span>
          ${m.lookupRule ? `<div class="recon-sub">Translation: ${esc(m.lookupRule)}</div>` : ''}</td>
        <td class="recon-c"><input type="checkbox" data-role="key" data-pair="${esc(pair.id)}" value="${m.id}" ${key ? 'checked' : ''} aria-label="Identifies a record"></td>
        <td class="recon-c"><input type="checkbox" data-role="total" data-pair="${esc(pair.id)}" value="${m.id}" ${amount ? 'checked' : ''} aria-label="Add up as a control total"></td>
        <td class="recon-c"><input type="checkbox" data-role="mask" data-pair="${esc(pair.id)}" value="${m.id}" ${personal ? 'checked' : ''} aria-label="Mask values in the report"></td>
      </tr>`;
  };

  const pairBlock = pair => {
    const guess = guessKeyMappingIds(pair);
    return `
      <section class="recon-pair" data-pair-block="${esc(pair.id)}">
        <h3><span class="recon-mono">${esc(pair.sourceTable)}</span> → <span class="recon-mono">${esc(pair.targetTable)}</span>
          <span class="recon-sub" style="display:inline">· ${pair.mappings.length} matched field${pair.mappings.length === 1 ? '' : 's'}</span></h3>
        <div class="grid-2 recon-files">
          <div class="field">
            <label for="src-${esc(pair.id)}">What was meant to arrive (CSV)</label>
            <input type="file" accept=".csv,text/csv" id="src-${esc(pair.id)}" data-file="source" data-pair="${esc(pair.id)}">
            <div class="recon-sub" data-status="source" data-pair="${esc(pair.id)}">No file added</div>
          </div>
          <div class="field">
            <label for="tgt-${esc(pair.id)}">What actually arrived in ${esc(newName(project))} (CSV)</label>
            <input type="file" accept=".csv,text/csv" id="tgt-${esc(pair.id)}" data-file="target" data-pair="${esc(pair.id)}">
            <div class="recon-sub" data-status="target" data-pair="${esc(pair.id)}">No file added</div>
          </div>
        </div>
        <div class="recon-sub" data-keycheck="${esc(pair.id)}" aria-live="polite"></div>
        <details class="recon-fields" ${guess.length ? '' : 'open'}>
          <summary>Fields and settings ${guess.length ? '' : '<span class="recon-warn">· choose the field that identifies a record</span>'}</summary>
          <table class="recon-table">
            <thead><tr><th>Matched field</th><th class="recon-c">Identifies a record</th><th class="recon-c">Add up as total</th><th class="recon-c">Mask values in report</th></tr></thead>
            <tbody>${pair.mappings.map(m => fieldRow(pair, m, guess)).join('')}</tbody>
          </table>
        </details>
      </section>`;
  };

  function renderRunsList() {
    const list = runs(getProject(id)).slice().reverse();
    if (!list.length) return '<p class="recon-sub">No comparisons yet.</p>';
    return list.map(r => `
      <div class="recon-run">
        <div>
          <strong>${esc(r.label)}</strong> <span class="jr-stage-pill jr-stage-${runStage(r)}">${runStage(r) === 'live' ? 'Live' : 'Test'}</span>
          <div class="recon-sub">${esc(fmtDate(r.at))} · ${esc(r.by)} · ${num(r.summary.recordsSource)} records · ${pct(r.summary.matchRate)} of field values matched</div>
        </div>
        <div class="recon-run-right">
          ${sevChips(r.summary)}
          <a class="btn btn-primary btn-sm" href="#/projects/${id}/reconcile/${r.id}">Open report</a>
          <button class="btn btn-ghost btn-sm" data-delete-run="${r.id}">Delete</button>
        </div>
      </div>`).join('');
  }

  // Which stage a comparison belongs to is worked out from the field tracker.
  const stageNow = suggestedStage(tableJourney(project));
  const nextName = () => `Comparison ${runs(project).length + 1}`;

  ui.mount(`
    ${ui.projectSteps(project, 'reconcile')}
    <div class="page-head"><div><h1>${esc(COMPARE_TEXT.title)}</h1></div>
      <a class="btn btn-secondary" href="#/projects/${project.id}/verify">← Field tracker</a></div>

    ${project.demo === FINANCE_DEMO ? `
      <div class="card recon-demo">
        <div><strong>Demo data</strong>
        <p class="recon-sub">Invented suppliers and ledger balances with faults planted in them. Compare 1, then compare 2 to see what was fixed.</p></div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-demo-load="1">Demo comparison 1</button>
          <button class="btn btn-secondary btn-sm" data-demo-load="2">Demo comparison 2</button>
        </div>
      </div>` : ''}

    <div class="card" id="recon-check">
      <p style="margin:0 0 0.5rem">${esc(COMPARE_TEXT.how)}</p>
      <p class="recon-sub" style="margin:0 0 0.9rem">${esc(COMPARE_TEXT.gives)}</p>
      <div class="field" style="max-width:360px">
        <label for="recon-label">Name of this comparison</label>
        <input id="recon-label" value="${esc(nextName())}">
      </div>
      ${pairs.map(pairBlock).join('')}
      <p class="recon-privacy">Your files are read in this browser only. Nothing is uploaded, and the records are not kept.
        Only the results are saved: counts, totals and a few example records per problem, with values hidden for fields you mark as masked.</p>
      <div id="recon-error" class="recon-error" role="alert" hidden></div>
      <button class="btn btn-primary" id="recon-run">Compare</button>
    </div>

    <div class="card">
      <h2 class="recon-h2">Comparisons so far</h2>
      <div id="recon-runs">${renderRunsList()}</div>
    </div>
  `);
  ui.attachLogout();

  const errorBox = document.getElementById('recon-error');
  const showError = msg => { errorBox.textContent = msg; errorBox.hidden = false; };

  document.querySelectorAll('input[data-file]').forEach(input => {
    input.addEventListener('change', async () => {
      const pairId = input.dataset.pair;
      const side = input.dataset.file;
      const status = document.querySelector(`[data-status="${side}"][data-pair="${CSS.escape(pairId)}"]`);
      const file = input.files?.[0];
      loaded[pairId] = loaded[pairId] || {};
      if (!file) {
        delete loaded[pairId][`${side}Rows`];
        status.textContent = 'No file added';
        updateKeyCheck(pairId);
        return;
      }
      try {
        const parsed = parseExtract(await file.text());
        const pair0 = pairs.find(p => p.id === pairId);
        const { rows, columns, renamed } = side === 'source' ? asOldColumns(parsed.rows, parsed.columns, pair0.mappings) : { ...parsed, renamed: false };
        loaded[pairId][`${side}Rows`] = rows;
        loaded[pairId][`${side}File`] = file.name;
        if (side === 'source') loaded[pairId].sourceTranslated = renamed;
        const pair = pairs.find(p => p.id === pairId);
        const wanted = pair.mappings.map(m => (side === 'source' ? m.sourceColumn : m.targetColumn));
        const missing = wanted.filter(c => !columns.includes(c));
        status.innerHTML = `${num(rows.length)} rows · ${columns.length} headings${renamed ? ' · read as the filled table' : ''}`
          + (missing.length ? ` <span class="recon-warn">· matched field${missing.length === 1 ? '' : 's'} not in file: ${esc(missing.join(', '))}</span>` : '');
      } catch (err) {
        delete loaded[pairId][`${side}Rows`];
        status.innerHTML = `<span class="recon-warn">${esc(err.message)}</span>`;
      }
      updateKeyCheck(pairId);
    });
  });

  const checked = (role, pairId) =>
    [...document.querySelectorAll(`input[data-role="${role}"][data-pair="${CSS.escape(pairId)}"]:checked`)].map(i => i.value);

  // Warn straight away if the ticked key fields do not pick out one record each.
  function updateKeyCheck(pairId) {
    const box = document.querySelector(`[data-keycheck="${CSS.escape(pairId)}"]`);
    const pair = pairs.find(p => p.id === pairId);
    const l = loaded[pairId] || {};
    const keyMappings = pair.mappings.filter(m => checked('key', pairId).includes(m.id));
    if (!box) return;
    if (!l.sourceRows && !l.targetRows) { box.textContent = ''; return; }
    if (!keyMappings.length) { box.innerHTML = '<span class="recon-warn">Tick at least one field that identifies a record.</span>'; return; }
    const repeats = (rows, cols) => {
      if (!rows) return 0;
      const seen = new Set();
      let n = 0;
      for (const row of rows) {
        const k = cols.map(c => String(row[c] ?? '').trim()).join(' | ');
        if (seen.has(k)) n++; else seen.add(k);
      }
      return n;
    };
    const missingIn = (rows, colsWanted) => rows?.length ? colsWanted.filter(c => !(c in rows[0])) : [];
    const ms = missingIn(l.sourceRows, keyMappings.map(m => m.sourceColumn));
    const mt = missingIn(l.targetRows, keyMappings.map(m => m.targetColumn));
    if (ms.length || mt.length) {
      box.innerHTML = `<span class="recon-warn">${ms.length ? `The old file has no ${esc(ms.join(', '))} column. ` : ''}${mt.length ? `The new file has no ${esc(mt.join(', '))} column. ` : ''}Records cannot be paired until the identifying field is in both files. Check you chose the right files, or tick a different key under Fields and settings.</span>`;
      return;
    }
    let s = repeats(l.sourceRows, keyMappings.map(m => m.sourceColumn));
    let autoNote = '';
    if (s > 0 && !keyTouched[pairId] && l.sourceRows) {
      const better = suggestKeyMappingIds(pair, l.sourceRows);
      if (better) {
        const before = keyMappings.map(m => m.sourceColumn).join(' + ');
        document.querySelectorAll(`input[data-role="key"][data-pair="${CSS.escape(pairId)}"]`).forEach(cb => { cb.checked = better.includes(cb.value); });
        keyMappings.splice(0, keyMappings.length, ...pair.mappings.filter(m => better.includes(m.id)));
        s = repeats(l.sourceRows, keyMappings.map(m => m.sourceColumn));
        autoNote = ` ${before} on its own repeats, so MapBridge chose the fewest fields that pick out each record once. Change this under Fields and settings if it is wrong.`;
      }
    }
    const t = repeats(l.targetRows, keyMappings.map(m => m.targetColumn));
    const label = keyMappings.map(m => m.sourceColumn).join(' + ');
    if (s > 0) {
      box.innerHTML = `<span class="recon-warn">${esc(label)} repeats on ${num(s)} row${s === 1 ? '' : 's'} of the old extract. If records are identified by more than one field, tick them all under Fields and settings.</span>`;
      const details = document.querySelector(`[data-pair-block="${CSS.escape(pairId)}"] details`);
      if (details) details.open = true;
    } else {
      box.textContent = `Records matched on ${label}.` + autoNote + (t > 0 ? ` ${num(t)} repeated ${t === 1 ? 'value' : 'values'} in the new extract will be reported as duplicates.` : '');
    }
  }

  document.querySelectorAll('input[data-role="key"]').forEach(cb =>
    cb.addEventListener('change', () => { keyTouched[cb.dataset.pair] = true; updateKeyCheck(cb.dataset.pair); }));

  document.getElementById('recon-run').addEventListener('click', async () => {
    errorBox.hidden = true;
    const inputs = {};
    for (const pair of pairs) {
      const l = loaded[pair.id] || {};
      if (!l.sourceRows && !l.targetRows) continue;
      if (!l.sourceRows || !l.targetRows) {
        return showError(`${pair.sourceTable} → ${pair.targetTable}: add both the old and the new extract, or neither.`);
      }
      const keyIds = checked('key', pair.id);
      if (!keyIds.length) {
        return showError(`${pair.sourceTable} → ${pair.targetTable}: tick at least one field that identifies a record.`);
      }
      inputs[pair.id] = {
        sourceRows: l.sourceRows, targetRows: l.targetRows, sourceFile: l.sourceFile, targetFile: l.targetFile,
        sourceTranslated: !!l.sourceTranslated,
        keyMappingIds: keyIds, maskedMappingIds: checked('mask', pair.id), totalMappingIds: checked('total', pair.id),
      };
    }
    try {
      const label = document.getElementById('recon-label').value.trim() || nextName();
      const run = await executeRun(getProject(id), { label, inputs, stage: stageNow });
      ui.toast('Checks complete');
      location.hash = `#/projects/${id}/reconcile/${run.id}`;
    } catch (err) {
      showError(err.message);
    }
  });

  document.querySelectorAll('[data-demo-load]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const load = Number(btn.dataset.demoLoad);
      try {
        const p = getProject(id);
        const run = await executeRun(p, { label: `Demo comparison ${load}`, inputs: demoInputs(p, load), stage: 'test' });
        location.hash = `#/projects/${id}/reconcile/${run.id}`;
      } catch (err) {
        showError(err.message);
      }
    });
  });

  document.getElementById('recon-runs').addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-run]');
    if (!btn) return;
    if (btn.dataset.armed !== 'yes') {
      btn.dataset.armed = 'yes';
      btn.textContent = 'Confirm delete';
      btn.classList.replace('btn-ghost', 'btn-danger');
      return;
    }
    const p = getProject(id);
    p.reconRuns = runs(p).filter(r => r.id !== btn.dataset.deleteRun);
    saveProject(p);
    document.getElementById('recon-runs').innerHTML = renderRunsList();
    ui.toast('Run deleted');
  });
}

function sevChips(summary) {
  const { high, medium, low } = summary.bySeverity;
  if (!summary.exceptions) return '<span class="recon-chip recon-ok">No exceptions</span>';
  return [
    high ? `<span class="recon-chip recon-high">${high} high</span>` : '',
    medium ? `<span class="recon-chip recon-medium">${medium} medium</span>` : '',
    low ? `<span class="recon-chip recon-low">${low} low</span>` : '',
  ].join('');
}

// ---------- report ----------

function headline(summary) {
  const { high } = summary.bySeverity;
  if (high) {
    return { cls: 'recon-banner-high', text: `${high} high-severity exception${high === 1 ? ' is' : 's are'} open.` };
  }
  if (summary.exceptions) {
    return { cls: 'recon-banner-medium', text: `No high-severity exceptions. ${summary.exceptions} lower-severity exception${summary.exceptions === 1 ? ' is' : 's are'} open.` };
  }
  return { cls: 'recon-banner-ok', text: 'All checks passed for the tables and fields covered.' };
}

// Findings about a whole field or total, where a record count would mislead.
const NOT_PER_RECORD = new Set(['total_differs', 'not_checked']);

function exceptionRow(g, i) {
  const examples = g.examples.length ? `
    <table class="recon-examples">
      <thead><tr><th>Record</th><th>Old system</th><th>Expected in new</th><th>Found in new</th></tr></thead>
      <tbody>${g.examples.map(x => `<tr><td class="recon-mono">${esc(x.key)}</td><td>${esc(x.source)}</td><td>${esc(x.expected)}</td><td>${esc(x.actual)}</td></tr>`).join('')}</tbody>
    </table>` : '';
  const keys = !g.examples.length && g.sampleKeys.length
    ? `<div class="recon-sub">Records: <span class="recon-mono">${esc(g.sampleKeys.join(', '))}</span>${g.count > g.sampleKeys.length ? ' …' : ''}</div>` : '';
  return `
    <tr class="recon-ex">
      <td class="recon-ref">E${i + 1}</td>
      <td><span class="recon-chip recon-${g.severity}">${SEVERITY_LABEL[g.severity]}</span></td>
      <td><div class="recon-mono">${esc(g.table)}</div><div class="recon-mono recon-sub">${esc(g.field)}</div>
        ${g.serviceArea ? `<div class="recon-sub">${esc(g.serviceArea)}</div>` : ''}</td>
      <td><div>${esc(g.title)}</div>${keys}${examples}</td>
      <td class="recon-r">${NOT_PER_RECORD.has(g.kind) ? '—' : num(g.count)}</td>
    </tr>`;
}

function changeList(title, groups, cls) {
  if (!groups.length) return '';
  return `
    <div class="recon-change ${cls}">
      <h4>${title} (${groups.length})</h4>
      <ul>${groups.map(g => `<li><span class="recon-mono">${esc(g.field)}</span> — ${esc(g.title)} <span class="recon-sub" style="display:inline">(${NOT_PER_RECORD.has(g.kind) ? 'whole field' : `${num(g.count)} record${g.count === 1 ? '' : 's'}`}${g.previousCount !== undefined && g.previousCount !== g.count ? `, was ${num(g.previousCount)}` : ''})</span></li>`).join('')}</ul>
    </div>`;
}

function pairSection(p) {
  const c = p.counts;
  const totals = p.fields.filter(f => f.total);
  return `
    <div class="recon-block">
      <h3><span class="recon-mono">${esc(p.sourceTable)}</span> → <span class="recon-mono">${esc(p.targetTable)}</span></h3>
      <table class="recon-table">
        <thead><tr><th>Records in old</th><th>Records in new</th><th>Paired</th><th>Missing from new</th><th>Only in new</th><th>Duplicated in new</th></tr></thead>
        <tbody><tr>
          <td>${num(c.source)}</td><td>${num(c.target)}</td><td>${num(c.matched)}</td>
          <td class="${c.missingInTarget ? 'recon-bad' : ''}">${num(c.missingInTarget)}</td>
          <td class="${c.unexpectedInTarget ? 'recon-bad' : ''}">${num(c.unexpectedInTarget)}</td>
          <td class="${c.duplicateTarget ? 'recon-bad' : ''}">${num(c.duplicateTarget)}</td>
        </tr></tbody>
      </table>
      ${totals.length ? `
        <table class="recon-table">
          <thead><tr><th>Control total</th><th class="recon-r">Old system</th><th class="recon-r">New system</th><th class="recon-r">Difference</th></tr></thead>
          <tbody>${totals.map(f => `<tr>
            <td class="recon-mono">${esc(f.sourceColumn)} → ${esc(f.targetColumn)}</td>
            <td class="recon-r">${formatAmount(f.total.source)}</td><td class="recon-r">${formatAmount(f.total.target)}</td>
            <td class="recon-r ${f.total.diff ? 'recon-bad' : 'recon-good'}">${f.total.diff ? formatAmount(f.total.diff) : 'Agrees'}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      <table class="recon-table">
        <thead><tr><th>Field</th><th class="recon-r">Compared</th><th class="recon-r">Matched</th><th class="recon-r">Differences</th><th class="recon-r">Matched after tidying format</th><th>Note</th></tr></thead>
        <tbody>${p.fields.map(f => `<tr>
          <td class="recon-mono">${esc(f.sourceColumn)} → ${esc(f.targetColumn)}</td>
          <td class="recon-r">${f.skipped ? '—' : num(f.compared)}</td>
          <td class="recon-r">${f.skipped ? '—' : num(f.matched)}</td>
          <td class="recon-r ${f.mismatched ? 'recon-bad' : ''}">${f.skipped ? '—' : num(f.mismatched)}</td>
          <td class="recon-r">${f.skipped ? '—' : num(f.formatOnly)}</td>
          <td class="recon-sub">${esc([f.isKey ? 'Key' : '', f.masked ? 'Values masked' : '', f.skipped, f.totalSkipped].filter(Boolean).join(' · '))}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

export async function renderReport({ id, runId }, ui) {
  esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const all = runs(project);
  const index = all.findIndex(r => r.id === runId);
  if (index < 0) return ui.renderNotFound();
  const run = all[index];
  const s = run.summary;
  const groups = allGroups(run);
  const banner = headline(s);
  const history = all.slice(0, index + 1);
  const compared = compareWithHistory(history, run);
  const change = compared.hasBaseline ? compared : null;

  let verified = false;
  try { verified = (await fingerprintRun(run)) === run.fingerprint; } catch { verified = false; }
  // The route may have changed while the fingerprint was being checked.
  if (!location.hash.endsWith(`/reconcile/${runId}`)) return;

  const user = getCurrentUser();
  const plain = plainSummary(run, history, project);

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    <div class="recon-toolbar no-print">
      <a class="btn btn-ghost btn-sm" href="#/projects/${id}/reconcile">← All comparisons</a>
      <div class="recon-switch" role="tablist" aria-label="Report view">
        <button role="tab" id="recon-tab-summary" aria-selected="true" aria-controls="recon-view-summary">Summary</button>
        <button role="tab" id="recon-tab-detail" aria-selected="false" aria-controls="recon-view-detail">Full detail</button>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" id="recon-print">Print or save as PDF</button>
        <button class="btn btn-secondary btn-sm" id="recon-csv">Download problems (CSV)</button>
        <button class="btn btn-secondary btn-sm" id="recon-json">Download full results (JSON)</button>
      </div>
    </div>

    ${summaryArticle(run, plain, verified)}

    <article class="recon-report" id="recon-view-detail" role="tabpanel" aria-labelledby="recon-tab-detail" hidden>
      <header class="recon-report-head">
        <div class="recon-eyebrow">Comparison report</div>
        <h1>${esc(run.label)}</h1>
        <p class="recon-meta">${esc(run.project.name)} · ${esc(run.project.sourceSystem)} → ${esc(run.project.targetSystem)}</p>
        <p class="recon-meta">Checked ${esc(fmtDate(run.at))} by ${esc(run.by)} · ${num(run.mappingCount)} agreed matches ·
          Fingerprint <span class="recon-mono">${esc(run.fingerprint.slice(0, 12))}</span>
          ${verified ? '<span class="recon-chip recon-ok">unchanged since run</span>' : '<span class="recon-chip recon-high">results changed since run</span>'}</p>
      </header>

      <section>
        <div class="recon-banner ${banner.cls}">${banner.text}
          <span>This report covers only the tables and fields listed under Scope and method.</span></div>
        <div class="recon-tiles">
          <div class="recon-tile"><b>${num(s.recordsSource)}</b><span>records in old system extracts</span></div>
          <div class="recon-tile"><b>${num(s.fieldsCompared)}</b><span>field values compared</span></div>
          <div class="recon-tile"><b>${pct(s.matchRate)}</b><span>of field values matched</span></div>
          <div class="recon-tile"><b>${s.totalsChecked ? `${s.totalsAgreed} of ${s.totalsChecked}` : '—'}</b><span>control totals agree</span></div>
          <div class="recon-tile"><b>${num(s.exceptions)}</b><span>exceptions: ${s.bySeverity.high} high, ${s.bySeverity.medium} medium, ${s.bySeverity.low} low</span></div>
        </div>
      </section>

      <section>
        <h2>1. Exceptions</h2>
        ${groups.length ? `
          <table class="recon-table recon-exceptions">
            <thead><tr><th>Ref</th><th>Severity</th><th>Where</th><th>Finding</th><th class="recon-r">Records</th></tr></thead>
            <tbody>${groups.map(exceptionRow).join('')}</tbody>
          </table>` : '<p>None.</p>'}
      </section>

      ${change ? `
        <section>
          <h2>2. Change since ${esc(change.singleLabel || 'each table was last checked')}</h2>
          <p class="recon-sub">${change.fixed.length} fixed · ${change.stillOpen.length} still open · ${change.added.length} new.
            Each table is compared with the last load in which that table was checked${change.singleLabel ? '' : `: ${esc(change.baselines.map(b => `${b.table} with ${b.label}`).join('; '))}`}.
            ${change.firstTime.length ? `First check, so nothing to compare: ${esc(change.firstTime.join('; '))}.` : ''}</p>
          ${changeList('New since the last comparison', change.added, 'recon-change-new')}
          ${changeList('Still open', change.stillOpen, 'recon-change-open')}
          ${changeList('Fixed since the last comparison', change.fixed, 'recon-change-fixed')}
        </section>` : ''}

      <section>
        <h2>${change ? 3 : 2}. Results by table</h2>
        ${run.pairs.map(pairSection).join('')}
      </section>

      <section>
        <h2>${change ? 4 : 3}. Scope and method</h2>
        <table class="recon-table">
          <thead><tr><th>Table</th><th>Old system extract</th><th>New system extract</th><th>Records matched on</th></tr></thead>
          <tbody>${run.pairs.map(p => `<tr>
            <td class="recon-mono">${esc(p.sourceTable)} → ${esc(p.targetTable)}</td>
            <td>${esc(p.sourceFile || '—')}</td><td>${esc(p.targetFile || '—')}</td>
            <td class="recon-mono">${esc(p.key.source.join(' + '))} = ${esc(p.key.target.join(' + '))}</td></tr>`).join('')}</tbody>
        </table>
        <ul class="recon-method">
          <li>Every record in the old system's file is paired with the record in the new system's file with the same value in the identifying fields. Each matched field is then compared.</li>
          <li>Where a match has a rule to turn one value into another, the old value is turned first and the result compared. A value with no rule is always reported.</li>
          <li>Values that are the same but written differently count as matched: spacing at either end, numbers such as 100 and 100.00, and dates in a different layout (day-first dates are read as DD/MM/YYYY). Blank and NULL are treated as the same.</li>
          <li>Control totals add up every row in each file, including records that could not be paired.</li>
          <li>Match and mismatch are decided by fixed rules. No AI is used in this report.</li>
          <li>Values in fields marked as masked are replaced with dots and a length. Record keys are shown so problems can be traced.</li>
        </ul>
        <h4>Not covered</h4>
        ${run.notCovered.length ? `<ul class="recon-method">${run.notCovered.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="recon-sub">Nothing left out: every matched table had files, and every new-system field in those tables is matched.</p>'}
        <p class="recon-sub">This is a comparison of two extract files. It does not check screens, reports, calculated fields or interfaces in the new system.</p>
      </section>

      <section>
        <h2>${change ? 5 : 4}. Review and acceptance</h2>
        <div class="recon-reviews-slot">${reviewsHtml(run)}</div>
        <form id="recon-review-form" class="recon-review-form no-print">
          <div class="field"><label for="rv-name">Name</label><input id="rv-name" value="${esc(user?.name || '')}" required></div>
          <div class="field"><label for="rv-role">Recording</label>
            <select id="rv-role"><option>Reviewed the problems</option><option>Accepted the result</option><option>Did not accept the result</option></select></div>
          <div class="field" style="flex:2"><label for="rv-note">Note (optional)</label><input id="rv-note" placeholder="For example: E3 accepted as known, fix due in the next load"></div>
          <button class="btn btn-secondary" type="submit">Record</button>
        </form>
      </section>

      <footer class="recon-foot">
        <div>Results fingerprint (SHA-256): <span class="recon-mono">${esc(run.fingerprint)}</span></div>
        <div>Produced by MapBridge. The fingerprint is calculated from the results at the time of the run; if any result is altered, it no longer matches.</div>
      </footer>
    </article>
  `);
  ui.attachLogout();

  const views = { summary: document.getElementById('recon-view-summary'), detail: document.getElementById('recon-view-detail') };
  const tabs = { summary: document.getElementById('recon-tab-summary'), detail: document.getElementById('recon-tab-detail') };
  const showView = name => {
    for (const key of Object.keys(views)) {
      views[key].hidden = key !== name;
      tabs[key].setAttribute('aria-selected', String(key === name));
    }
    window.scrollTo(0, 0);
  };
  tabs.summary.onclick = () => showView('summary');
  tabs.detail.onclick = () => showView('detail');
  document.querySelector('[data-show-detail]')?.addEventListener('click', e => { e.preventDefault(); showView('detail'); });

  document.getElementById('recon-print').onclick = () => window.print();
  document.getElementById('recon-csv').onclick = () => {
    const rows = exceptionRows(run);
    if (!rows.length) return ui.toast('No problems to download');
    downloadCSV(rows, `${slug(run.project.name)}-${slug(run.label)}-exceptions.csv`);
  };
  document.getElementById('recon-json').onclick = () =>
    downloadJSON(run, `${slug(run.project.name)}-${slug(run.label)}-results.json`);

  document.getElementById('recon-review-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('rv-name').value.trim();
    if (!name) return;
    const p = getProject(id);
    const r = runs(p).find(x => x.id === runId);
    r.reviews = [...(r.reviews || []), {
      name,
      role: document.getElementById('rv-role').value,
      note: document.getElementById('rv-note').value.trim(),
      at: new Date().toISOString(),
    }];
    saveProject(p);
    document.querySelectorAll('.recon-reviews-slot').forEach(el => { el.innerHTML = reviewsHtml(r); });
    document.getElementById('rv-note').value = '';
    ui.toast('Recorded');
  });
}

function reviewsHtml(run) {
  if (!run.reviews?.length) {
    return '<p class="recon-sub">Nobody has recorded a review yet.</p>';
  }
  return `<table class="recon-table">
    <thead><tr><th>Name</th><th>Recorded</th><th>Date</th><th>Note</th></tr></thead>
    <tbody>${run.reviews.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.role)}</td><td>${esc(fmtDate(r.at))}</td><td>${esc(r.note || '')}</td></tr>`).join('')}</tbody>
  </table>`;
}

// ---------- plain-English summary ----------

const tick = ok => (ok
  ? '<span class="recon-mark recon-mark-ok" role="img" aria-label="Fine">✓</span>'
  : '<span class="recon-mark recon-mark-bad" role="img" aria-label="Problem">!</span>');

function trendHtml(trend) {
  if (trend.length < 2) return '';
  const max = Math.max(1, ...trend.map(t => t.total));
  return `
    <div class="recon-trend" role="img" aria-label="Issues found at each check: ${esc(trend.map(t => `${t.label} ${t.total}`).join(', '))}">
      ${trend.map(t => `
        <div class="recon-trend-row ${t.current ? 'recon-trend-current' : ''}">
          <span class="recon-trend-label">${esc(t.label)}</span>
          <span class="recon-trend-bar">
            <i class="recon-trend-serious" style="width:${(t.serious / max) * 100}%"></i><i class="recon-trend-other" style="width:${(t.other / max) * 100}%"></i>
          </span>
          <span class="recon-trend-count">${t.total ? `${t.serious} serious, ${t.other} smaller` : 'none'}${t.partial ? ' (part checked)' : ''}</span>
        </div>`).join('')}
    </div>`;
}

function summaryArticle(run, plain, verified) {
  const order = { high: 0, medium: 1, low: 2 };
  const issues = [...plain.issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return `
    <article class="recon-report recon-plain" id="recon-view-summary" role="tabpanel" aria-labelledby="recon-tab-summary">
      <header class="recon-report-head">
        <div class="recon-eyebrow">File comparison summary</div>
        <h1>${esc(run.label)}</h1>
        <p class="recon-meta">${esc(run.project.name)} · moving from ${esc(run.project.sourceSystem)} to ${esc(run.project.targetSystem)}</p>
        <p class="recon-meta">Checked ${esc(fmtDate(run.at))} by ${esc(run.by)}</p>
      </header>

      <section class="recon-status recon-status-${plain.status.level}">
        <div class="recon-status-label">${esc(plain.status.label)}</div>
        <div class="recon-status-headline">${esc(plain.status.headline)}</div>
      </section>

      <section>
        <h2>In short</h2>
        ${plain.inShort.map(t => `<p class="recon-lead">${esc(t)}</p>`).join('')}
      </section>

      <section class="recon-two">
        <div>
          <h2>Did everything arrive?</h2>
          <ul class="recon-checks">${plain.arrival.map(a => `<li>${tick(a.ok)}<span>${esc(a.text)}</span></li>`).join('')}</ul>
        </div>
        <div>
          <h2>Do the totals agree?</h2>
          ${plain.money.length ? `<ul class="recon-checks">${plain.money.map(m => `
            <li>${tick(m.ok)}<span><strong>${esc(m.label)}</strong><br>${esc(m.text)}
              <small>Old system ${esc(m.oldTotal)} · New system ${esc(m.newTotal)}</small></span></li>`).join('')}</ul>`
            : '<p class="recon-sub">No totals were added up in this check.</p>'}
        </div>
      </section>

      <section>
        <h2>What needs fixing</h2>
        ${issues.length ? `<ol class="recon-issues">${issues.map(i => `
          <li class="recon-issue recon-issue-${i.severity}">
            <span class="recon-chip recon-${i.severity}">${esc(i.level)}</span>
            <div>
              <p>${esc(i.text)}</p>
              <p class="recon-sub">${esc(i.why)}${i.area ? ` Owner: ${esc(i.area)}.` : ''}</p>
            </div>
          </li>`).join('')}</ol>` : '<p class="recon-lead">Nothing. No differences were found.</p>'}
      </section>

      ${plain.progress ? `
        <section>
          <h2>Progress since ${esc(plain.progress.previousLabel)}</h2>
          <p class="recon-lead">${esc(plain.progress.text)}</p>
          ${trendHtml(plain.trend)}
        </section>` : ''}

      <section>
        <h2>What this check does not tell you</h2>
        <ul class="recon-method">${plain.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      </section>

      <section>
        <h2>Who has reviewed this</h2>
        <div class="recon-reviews-slot">${reviewsHtml(run)}</div>
      </section>

      <footer class="recon-foot">
        <div>Every statement here comes from the full report, which lists each difference with example records.
          <a href="#" data-show-detail class="no-print">See the full detail</a></div>
        <div>Reference ${esc(run.fingerprint.slice(0, 12))}${verified ? ' · results unchanged since the check was run' : ' · warning: results have changed since the check was run'}.
          Matches are decided by fixed rules, not by AI.</div>
      </footer>
    </article>`;
}

// ---------- project overview ----------

const STATUS_CHIP = { attention: 'recon-high', incomplete: 'recon-low', nearly: 'recon-medium', clear: 'recon-ok' };
const STATUS_WORD = { attention: 'Needs attention', incomplete: 'Incomplete', nearly: 'Nearly there', clear: 'All clear' };

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function overviewTableRow(projectId, t) {
  const issues = t.state === 'not_checked' ? '—'
    : t.issues.total ? [
      t.issues.high ? `<span class="recon-chip recon-high">${t.issues.high} serious</span>` : '',
      (t.issues.medium + t.issues.low) ? `<span class="recon-chip recon-medium">${t.issues.medium + t.issues.low} smaller</span>` : '',
    ].join(' ') : '<span class="recon-chip recon-ok">None</span>';
  const totals = !t.totals ? '—' : !t.totals.checked ? 'None taken'
    : t.totals.agreed === t.totals.checked ? `<span class="recon-good">${t.totals.checked === 1 ? 'Agrees' : `All ${t.totals.checked} agree`}</span>`
      : `<span class="recon-bad">${t.totals.checked - t.totals.agreed} of ${t.totals.checked} differ</span>`;
  return `
    <tr>
      <td><strong>${esc(capitalise(t.noun))}</strong>
        <div class="recon-mono recon-sub">${esc(t.sourceTable)} → ${esc(t.targetTable)}</div>
        ${t.notes.map(n => `<div class="recon-sub recon-warn">${esc(n)}</div>`).join('')}</td>
      <td>${t.run ? `${esc(t.run.label)}<div class="recon-sub">${esc(fmtDate(t.run.at))}</div>` : '<span class="recon-warn">Not checked</span>'}</td>
      <td class="recon-r">${t.records ? `${num(t.records.old)} → ${num(t.records.new)}` : '—'}</td>
      <td class="recon-r">${t.matchRate === null ? '—' : pct(t.matchRate)}</td>
      <td>${totals}</td>
      <td>${issues}</td>
      <td class="recon-r">${t.trend.length > 1 ? esc(t.trend.join(' → ')) : '—'}</td>
      <td class="no-print">${t.run ? `<a class="btn btn-ghost btn-sm" href="#/projects/${projectId}/reconcile/${t.run.id}">Report</a>` : ''}</td>
    </tr>`;
}

// The file checks for one area's tables. Used by the area page.
export function fileCheckTable(projectId, area, escapeHtml) {
  if (escapeHtml) esc = escapeHtml;
  return `
      <table class="recon-table">
        <thead><tr><th>Table</th><th>Last checked</th><th class="recon-r">Records, old → new</th><th class="recon-r">Details matched</th><th>Totals</th><th>Open issues</th><th class="recon-r">Issues over time</th><th class="no-print"></th></tr></thead>
        <tbody>${area.tables.map(t => overviewTableRow(projectId, t)).join('')}</tbody>
      </table>`;
}

function areaSection(projectId, area, index, userName) {
  const so = area.signoff;
  const signoffLine = !so ? '<span class="recon-sub">Not signed off.</span>'
    : `<span class="recon-sub"><strong>${esc(so.role)}</strong> by ${esc(so.name)} on ${esc(fmtDate(so.at))}${so.note ? `. ${esc(so.note)}` : ''}
        ${area.signoffCurrent ? '' : '<span class="recon-warn"> This was recorded before the latest check, so it no longer counts.</span>'}</span>`;
  return `
    <section class="recon-area">
      <h2>${esc(area.name)} <span class="recon-chip ${STATUS_CHIP[area.status]}">${STATUS_WORD[area.status]}</span>
        ${area.signedOff ? '<span class="recon-chip recon-ok">Signed off</span>' : ''}</h2>
      <table class="recon-table">
        <thead><tr><th>Table</th><th>Last checked</th><th class="recon-r">Records, old → new</th><th class="recon-r">Details matched</th><th>Totals</th><th>Open issues</th><th class="recon-r">Issues over time</th><th class="no-print"></th></tr></thead>
        <tbody>${area.tables.map(t => overviewTableRow(projectId, t)).join('')}</tbody>
      </table>
      <div class="recon-signoff">${signoffLine} <a class="no-print" href="${areaPath(projectId, area.name)}">Open the ${esc(area.name)} page to sign off</a></div>
    </section>`;
}

export function renderOverview({ id }, ui) {
  esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const user = getCurrentUser();
  const all = runs(project);
  const o = projectOverview(project, all, { finalRunId: project.reconFinalRunId || null, signoffs: project.reconAreaSignoffs || [] });
  const s = o.summary;
  const board = areaBoard(project, o);
  const olderChecks = o.tables.some(t => t.run && !all.find(r => r.id === t.run.id)?.pairs.find(p => p.id === t.id)?.mappingStamp);

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'overview')}
    <div class="recon-toolbar no-print">
      <a class="btn btn-ghost btn-sm" href="#/projects/${id}/reconcile">← All comparisons</a>
      <button class="btn btn-primary btn-sm" id="recon-print">Print or save as PDF</button>
    </div>

    <article class="recon-report">
      <header class="recon-report-head">
        <div class="recon-eyebrow">All areas</div>
        <h1>${esc(project.name)}</h1>
        <p class="recon-meta">Moving from ${esc(project.sourceSystem)} to ${esc(project.targetSystem)} · as at ${esc(fmtDate(new Date().toISOString()))}</p>
        ${all.length ? `<p class="recon-meta">File comparisons: ${s.finalRun
          ? `judged on the final load, <strong>${esc(s.finalRun.label)}</strong> (${esc(fmtDate(s.finalRun.at))}). Earlier comparisons are not counted.`
          : 'each table is judged on its own most recent comparison. No final load has been chosen.'}</p>` : ''}
      </header>

      <section>
        <h2>Where each area is</h2>
        <p class="recon-sub">Open an area to see its fields and to record its sign-off.</p>
        <table class="recon-table">
          <thead><tr><th>Area</th>${STAGES.map(st => `<th>${esc(st.label)}</th>`).join('')}</tr></thead>
          <tbody>${board.map(r => `<tr><td><a href="${areaPath(id, r.name)}"><strong>${esc(r.name)}</strong></a></td>${STAGES.map(st => `<td class="home-cell home-cell-${cellTone(r.cells[st.key].state, r.cells[st.key].text)}">${boldLeadNumber(r.cells[st.key].text, esc)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </section>

      ${!all.length ? '' : `<h2>File comparisons</h2>
      <section class="recon-status recon-status-${s.status.level}">
        <div class="recon-status-label">${esc(s.status.label)}</div>
        <div class="recon-status-headline">${esc(s.status.headline)}</div>
      </section>

      <section>
        <div class="recon-tiles recon-tiles-4">
          <div class="recon-tile"><b>${s.checked} of ${s.tables}</b><span>tables checked${s.recheck ? `, ${s.recheck} need re-checking` : ''}</span></div>
          <div class="recon-tile"><b>${s.areasClear} of ${s.areas}</b><span>areas all clear</span></div>
          <div class="recon-tile"><b>${num(s.high + s.other)}</b><span>open issues: ${s.high} serious, ${s.other} smaller</span></div>
          <div class="recon-tile"><b>${s.areasSigned} of ${s.areas}</b><span>areas signed off</span></div>
        </div>
      </section>

      ${o.areas.map((a, i) => areaSection(id, a, i, user?.name || '')).join('')}`}

      ${!all.length ? '' : `<section>
        <h2>Final load</h2>
        <p class="recon-sub">During test loads each table is judged on its latest comparison. Once the final load has been run and checked, choose it here.
          Every table is then judged on that load alone, and any table missing from it shows as not checked.</p>
        ${all.length ? `
          <form id="recon-final-form" class="recon-review-form no-print">
            <div class="field"><label>Final load<select name="run">
              <option value="">None chosen</option>
              ${all.slice().reverse().map(r => `<option value="${r.id}" ${project.reconFinalRunId === r.id ? 'selected' : ''}>${esc(r.label)} · ${esc(fmtDate(r.at))}</option>`).join('')}
            </select></label></div>
            <button class="btn btn-secondary" type="submit">Save</button>
          </form>` : '<p class="recon-sub">No loads have been checked yet.</p>'}
      </section>`}

      <section>
        <h2>What this overview does not tell you</h2>
        <ul class="recon-method">
          <li>It covers tables that have matched fields. A table with no matches does not appear here at all.</li>
          <li>Each table is checked on its own. Links between tables, and figures that should match across tables, are not checked.</li>
          <li>An area’s status is that of its worst table. A table that has not been checked keeps its area and the project from showing as all clear.</li>
          ${olderChecks ? '<li>Some checks were run before MapBridge kept track of changed matches, so a later change to those matches cannot be spotted.</li>' : ''}
          <li>This is evidence for a go-live decision. The decision itself belongs to the people who sign.</li>
        </ul>
      </section>

      <footer class="recon-foot">
        <div>Produced by MapBridge from ${num(all.length)} checked ${all.length === 1 ? 'load' : 'loads'}. Matches are decided by fixed rules, not by AI.</div>
      </footer>
    </article>
  `);
  ui.attachLogout();

  document.getElementById('recon-print').onclick = () => window.print();

  document.getElementById('recon-final-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const p = getProject(id);
    p.reconFinalRunId = new FormData(e.target).get('run') || null;
    saveProject(p);
    ui.toast(p.reconFinalRunId ? 'Final load set' : 'Final load cleared');
    renderOverview({ id }, ui);
  });
}
