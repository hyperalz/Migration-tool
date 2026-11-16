// The "import a mapping template" card on the field lists screen.

import { getProject, saveProject, uid } from './store.js';
import { getCurrentUser } from './auth.js';
import { defaultVerification } from './verification.js';
import { downloadCSV } from './export.js';
import { parseMappingTemplate, mergeSchema, questionRows } from './template-import.js';

const num = n => Number(n).toLocaleString('en-GB');

export function templateImportCard() {
  return `
    <details class="card template-import" id="template-import">
      <summary><strong>Have a mapping spreadsheet from the supplier?</strong>
        <span class="recon-sub" style="display:inline"> Import the new system's templates, and any matches already made, in one go.</span></summary>
      <p class="recon-sub" style="margin:0.75rem 0">One row per field, with headings such as <code>csv_name</code>, <code>column_name</code> and <code>data_type</code>.
        If the old system's table and field are noted alongside (for example <code>SynergyTable</code>, <code>SynergyField</code>), those matches are imported too.
        The file is read in this browser and is not sent anywhere.</p>
      <input type="file" id="template-file" accept=".csv,text/csv">
      <div id="template-preview"></div>
    </details>`;
}

export function bindTemplateImport(projectId, ui, rerender) {
  const input = document.getElementById('template-file');
  const preview = document.getElementById('template-preview');
  if (!input) return;
  let parsed = null;
  let fileName = '';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    parsed = null;
    if (!file) { preview.innerHTML = ''; return; }
    try {
      if (typeof Papa === 'undefined') throw new Error('The CSV reader did not load. Check your connection and reload.');
      const project = getProject(projectId);
      const rows = Papa.parse((await file.text()).replace(/^﻿/, ''), { skipEmptyLines: false }).data;
      parsed = parseMappingTemplate(rows, { targetSystem: project.targetSystem, sourceSystem: project.sourceSystem });
      fileName = file.name;
      const s = parsed.stats;
      preview.innerHTML = `
        <div class="template-found">
          <p><strong>Found ${num(s.fields)} fields in ${num(s.tables)} tables</strong> for the new system. ${num(s.described)} come with a description.</p>
          <ul>
            <li><strong>${num(s.matched)}</strong> already matched, to ${num(s.sourceFields)} old-system fields in ${num(s.sourceTables)} tables</li>
            <li><strong>${num(s.notUsed)}</strong> marked as not used</li>
            <li><strong>${num(s.questions)}</strong> with an open question</li>
            <li><strong>${num(s.unmatched)}</strong> with no match yet</li>
            ${s.duplicates ? `<li>${num(s.duplicates)} repeated rows left out</li>` : ''}
          </ul>
          <p class="recon-sub">Importing adds to what is already here. Nothing is removed or overwritten.</p>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem">
            <button class="btn btn-primary btn-sm" id="template-apply">Import these</button>
            <button class="btn btn-secondary btn-sm" id="template-questions">Download the question list (CSV)</button>
          </div>
        </div>`;
      document.getElementById('template-questions').onclick = () => {
        const rowsOut = questionRows(parsed);
        if (!rowsOut.length) return ui.toast('No open questions in this file');
        downloadCSV(rowsOut, 'mapping-questions.csv');
      };
      document.getElementById('template-apply').onclick = apply;
    } catch (err) {
      preview.innerHTML = `<p class="recon-error" style="margin-top:0.75rem">${ui.esc(err.message)}</p>`;
    }
  });

  function apply() {
    if (!parsed) return;
    const user = getCurrentUser();
    const p = getProject(projectId);
    const target = mergeSchema(p.targetSchema, parsed.targetSchema);
    const source = mergeSchema(p.sourceSchema, parsed.sourceSchema);
    p.targetSchema = { ...target.schema, system: p.targetSystem || target.schema.system };
    p.sourceSchema = { ...source.schema, system: p.sourceSystem || source.schema.system };

    const have = new Set((p.mappings || []).map(m => [m.sourceTable, m.sourceColumn, m.targetTable, m.targetColumn].join('␟')));
    let added = 0;
    p.mappings = p.mappings || [];
    for (const m of parsed.mappings) {
      const key = [m.sourceTable, m.sourceColumn, m.targetTable, m.targetColumn].join('␟');
      if (have.has(key)) continue;
      have.add(key);
      const { needsReview, ...rest } = m;
      p.mappings.push({
        id: uid(), ...rest,
        transformNotes: needsReview ? `To confirm: ${rest.transformNotes || 'marked with a question in the template'}` : rest.transformNotes,
        verification: defaultVerification('Imported from mapping template', user?.name || 'import'),
      });
      added++;
    }

    const areas = p.serviceAreas || [];
    const names = new Set(areas.map(a => (typeof a === 'string' ? a : a.name)));
    for (const a of parsed.areas) if (!names.has(a)) { areas.push({ id: uid(), name: a }); names.add(a); }
    p.serviceAreas = areas;

    p.templateImport = {
      at: new Date().toISOString(), file: fileName, stats: parsed.stats,
      notUsed: parsed.notUsed, questions: parsed.questions, unmatched: parsed.unmatched,
    };
    if (p.mappings.length) p.status = 'mapping';
    saveProject(p);
    ui.toast(`Imported ${num(target.added)} new-system fields and ${num(added)} matches`);
    rerender();
  }
}
