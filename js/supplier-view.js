// The supplier area: a separate part of the app for suppliers who want to
// register their system's field list. It sits outside the council journey,
// needs no account, and sends nothing anywhere: a supplier checks their file
// here, then sends it to us.

import { PROFILES, SOURCE_KIND, LIST_TYPE, listTypeOf, TEMPLATE_COLUMNS, templateCSV, checkTemplate, profileFieldCount } from './system-profiles.js';
import { downloadText } from './export.js';

export const SUPPLIER_TEXT = {
  title: "Register your system's field list",
  lead: 'For suppliers of systems that councils and schools move to. Send us the names of your fields, never data. Councils moving to your system can then start from a ready list.',
  getTitle: 'What you get',
  get: [
    'Councils moving to your system start with your fields already listed, so projects start sooner.',
    'Fewer of the same questions about your fields on every project.',
    'A "Checked by supplier" label on your list while you keep it up to date.',
  ],
  holdTitle: 'What we hold, and what we do with it',
  hold: [
    ['What we hold', 'Field names, types, whether a field is needed, short descriptions and the release. Never data.'],
    ['How it is used', 'MapBridge shows your list to councils, and uses it to suggest matches to and from other systems.'],
    ['Changing your mind', 'Send an updated list with each release, or ask us to remove it at any time.'],
    ['No endorsement', 'Listing a system does not mean MapBridge recommends it, or that you endorse MapBridge.'],
  ],
  stepsTitle: 'How to register',
  steps: [
    'Download the template.',
    'Fill in one row per field.',
    'Check your file on this page. It stays on your computer.',
    'Message us on LinkedIn and we will tell you where to send it.',
    'We add your list, you confirm it looks right, and it gets the "Checked by supplier" label.',
  ],
  download: 'Download the template (CSV)',
  checkTitle: 'Check your file',
  checkLead: 'Choose your filled-in template. MapBridge reads it in your browser. Nothing is uploaded or sent.',
  choose: 'Choose a file',
  fileHint: 'A CSV or Excel file with the template headings in row 1.',
  ok: s => `Your file is ready to send: ${s.fields} ${s.fields === 1 ? 'field' : 'fields'} in ${s.tables} ${s.tables === 1 ? 'table' : 'tables'}${s.release ? `, release ${s.release}` : ''}.`,
  notReady: n => `There ${n === 1 ? 'is 1 problem' : `are ${n} problems`} to fix before you send the file`,
  worthALook: 'Worth a second look',
  heldTitle: 'Field lists MapBridge holds',
  heldLead: 'Each list says where it came from and when it was checked. Statutory return lists show what any system must send to government. Lists you register are system lists.',
  affiliation: 'MapBridge is made by Foam Works Digital Ltd. We are not affiliated with any supplier named here.',
  contact: 'Message Alex Osborne on LinkedIn',
};

const LINKEDIN = 'https://www.linkedin.com/in/alexosfwd/';

export function renderSuppliers({ nav, mount, esc, toast }) {
  document.getElementById('app-shell').innerHTML = nav('For suppliers') + '<main class="app-main" id="app-main"></main>';
  const T = SUPPLIER_TEXT;
  mount(`
    <div class="supplier-page">
      <div class="page-head"><div>
        <span class="supplier-kicker">For suppliers</span>
        <h1>${esc(T.title)}</h1>
        <p>${esc(T.lead)}</p>
      </div></div>

      <div class="grid-2 supplier-grid">
        <section class="card">
          <h2>${esc(T.getTitle)}</h2>
          <ul class="supplier-list">${T.get.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </section>
        <section class="card">
          <h2>${esc(T.stepsTitle)}</h2>
          <ol class="supplier-list">${T.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          <p style="margin:0.75rem 0 0"><button type="button" class="btn btn-secondary btn-sm" id="supplier-template">${esc(T.download)}</button></p>
          <p class="recon-sub" style="margin:0.5rem 0 0">The template has these headings: ${TEMPLATE_COLUMNS.map(esc).join(', ')}.</p>
        </section>
      </div>

      <section class="card supplier-check" aria-labelledby="supplier-check-title">
        <h2 id="supplier-check-title">${esc(T.checkTitle)}</h2>
        <p class="recon-sub" style="margin:0 0 0.75rem">${esc(T.checkLead)}</p>
        <div class="field">
          <label for="supplier-file">${esc(T.choose)}</label>
          <p class="route-hint">${esc(T.fileHint)}</p>
          <input type="file" id="supplier-file" accept=".csv,.xlsx,.xls">
        </div>
        <div id="supplier-result" aria-live="polite"></div>
      </section>

      <section class="card">
        <h2>${esc(T.holdTitle)}</h2>
        <dl class="supplier-terms">${T.hold.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p style="margin:0.75rem 0 0"><a href="${LINKEDIN}" target="_blank" rel="noopener">${esc(T.contact)}</a></p>
      </section>

      <section class="card">
        <h2>${esc(T.heldTitle)}</h2>
        <p class="recon-sub" style="margin:0 0 0.75rem">${esc(T.heldLead)} <a href="library.html">See the route library</a>.</p>
        <table class="supplier-held">
          <thead><tr><th scope="col">List</th><th scope="col">Kind</th><th scope="col">Fields</th><th scope="col">Where it came from</th><th scope="col">Checked</th></tr></thead>
          <tbody>${PROFILES.map(p => `
            <tr>
              <td>${esc(p.system)}<br><span class="recon-sub">${esc(p.version)}</span></td>
              <td>${esc(LIST_TYPE[listTypeOf(p)].label)}</td>
              <td>${profileFieldCount(p)}</td>
              <td><span class="profile-badge profile-badge-${esc(p.source.kind)}">${esc(SOURCE_KIND[p.source.kind]?.label || '')}</span><br><a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.label)}</a></td>
              <td>${esc(p.checked)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>

      <p class="recon-sub supplier-affiliation">${esc(T.affiliation)}</p>
    </div>
  `);

  document.getElementById('supplier-template').addEventListener('click', () => {
    downloadText(templateCSV(), 'mapbridge-field-list-template.csv', 'text/csv');
  });

  document.getElementById('supplier-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    const out = document.getElementById('supplier-result');
    if (!file) return;
    try {
      const rows = await readRows(file);
      out.innerHTML = resultHtml(checkTemplate(rows), esc);
    } catch (err) {
      out.innerHTML = `<div class="alert alert-warn" role="alert">${esc(err.message)}</div>`;
      toast?.('The file could not be read');
    }
  });
}

async function readRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    if (typeof Papa === 'undefined') throw new Error('The CSV reader did not load. Check your connection and reload.');
    return Papa.parse((await file.text()).replace(/^﻿/, ''), { skipEmptyLines: false }).data;
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (typeof XLSX === 'undefined') throw new Error('The Excel reader did not load. Check your connection and reload, or save the file as CSV.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  }
  throw new Error('Choose a CSV or Excel file.');
}

export function resultHtml({ errors, warnings, summary }, esc) {
  const T = SUPPLIER_TEXT;
  const list = items => `<ul>${items.slice(0, 20).map(x => `<li>${esc(x)}</li>`).join('')}${items.length > 20 ? `<li>And ${items.length - 20} more.</li>` : ''}</ul>`;
  const warn = warnings.length ? `<div class="alert alert-info supplier-warnings"><strong>${esc(T.worthALook)}</strong>${list(warnings)}</div>` : '';
  if (errors.length) {
    return `<div class="supplier-errors" role="alert"><h3>${esc(T.notReady(errors.length))}</h3>${list(errors)}</div>${warn}`;
  }
  return `<div class="alert alert-success" role="status"><span aria-hidden="true">✓</span> ${esc(T.ok(summary))}</div>${warn}`;
}
