// The Project settings page. See settings.js for what each part changes.

import { GOVUK_TEXT } from './govuk.js';
import { showErrors } from './govuk-view.js';
import { getProject, saveProject, getUsers } from './store.js';
import { getAISettings } from './ai-suggestions.js';
import { getProjectTeamNames } from './verification.js';
import { routeQuestionsHtml, routeFromForm, ROUTE_TEXT } from './route.js';
import {
  SETTINGS_TEXT, setNames, areaRows, setAreaManager, addArea, removeArea, addPerson, removePerson, aiSummary,
} from './settings.js';
import { areaPath } from './area-page.js';

export function renderSettings({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const rows = areaRows(project);
  const people = getProjectTeamNames(project, getUsers());
  const rerender = () => renderSettings({ id }, ui);

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'settings')}
    <div class="page-head"><div><h1>Project settings</h1><p>${esc(SETTINGS_TEXT.lead)}</p></div></div>

    <section class="card settings-section" id="settings-names-card">
      <h2>Names</h2>
      <p class="recon-sub">${esc(SETTINGS_TEXT.names)}</p>
      <form id="settings-names" class="settings-form">
        <div class="field"><label for="s-name">Project name</label><input id="s-name" name="name" value="${esc(project.name)}" required></div>
        <div class="field"><label for="s-old">The old system's name</label><input id="s-old" name="oldName" value="${esc(project.sourceSystem || '')}" placeholder="For example, Synergy"></div>
        <div class="field"><label for="s-new">The new system's name</label><input id="s-new" name="newName" value="${esc(project.targetSystem || '')}" placeholder="For example, Impulse"></div>
        <button class="btn btn-primary btn-sm" type="submit">Save names</button>
      </form>
    </section>

    <section class="card settings-section" id="settings-route-card">
      <h2>What you have</h2>
      <p class="recon-sub">${esc(ROUTE_TEXT.lead)}</p>
      <form id="settings-route">
        ${routeQuestionsHtml(project.route, esc, 'st')}
        <button class="btn btn-primary btn-sm" type="submit">Save answers</button>
      </form>
    </section>

    <section class="card settings-section" id="settings-areas-card">
      <h2>Areas and their managers</h2>
      <p class="recon-sub">${esc(SETTINGS_TEXT.areas)}</p>
      ${rows.length ? `
      <form id="settings-managers">
        <div class="schema-preview settings-table"><table>
          <thead><tr><th scope="col">Area</th><th scope="col">Service area manager</th><th scope="col">Fields</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>${rows.map((r, i) => `
            <tr>
              <td><a href="${areaPath(id, r.name)}">${esc(r.name)}</a></td>
              <td><input name="manager-${i}" data-area="${esc(r.name)}" value="${esc(r.manager)}" placeholder="Name" aria-label="Service area manager for ${esc(r.name)}"></td>
              <td>${r.fields}</td>
              <td>${r.removable
                ? `<button type="button" class="btn btn-ghost btn-sm settings-remove-area" data-area="${esc(r.name)}">Remove</button>`
                : `<span class="recon-sub" title="${esc(SETTINGS_TEXT.inUse)}">In use</span>`}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <button class="btn btn-primary btn-sm" type="submit" style="margin-top:0.6rem">Save managers</button>
      </form>` : '<p class="recon-sub">No areas yet.</p>'}
      <form id="settings-add-area" class="team-add-form" novalidate style="margin-top:0.75rem">
        <input id="settings-new-area" name="name" placeholder="New area, for example Attendance" aria-label="New area name">
        <button type="submit" class="btn btn-secondary btn-sm">Add area</button>
      </form>
    </section>

    <section class="card settings-section" id="settings-people-card">
      <h2>People who record steps</h2>
      <p class="recon-sub">${esc(SETTINGS_TEXT.people)}</p>
      <div class="team-chips">${people.length
        ? people.map(n => `<span class="team-chip">${esc(n)}<button type="button" class="team-chip-remove settings-remove-person" data-name="${esc(n)}" aria-label="Remove ${esc(n)}">×</button></span>`).join('')
        : '<span class="recon-sub">No names yet.</span>'}</div>
      <form id="settings-add-person" class="team-add-form" novalidate style="margin-top:0.75rem">
        <input id="settings-new-person" name="name" placeholder="Full name" aria-label="Full name">
        <button type="submit" class="btn btn-secondary btn-sm">Add</button>
      </form>
    </section>

    <section class="card settings-section" id="settings-ai-card">
      <h2>AI settings</h2>
      <p class="recon-sub">${esc(SETTINGS_TEXT.ai)}</p>
      <p>${esc(aiSummary(getAISettings()))}</p>
      <button type="button" class="btn btn-secondary btn-sm" id="settings-open-ai">Change AI settings</button>
    </section>
  `);
  ui.attachLogout();

  const save = (fn, message) => { const p = getProject(id); const out = fn(p); saveProject(p); if (message) ui.toast(message); rerender(); return out; };

  document.getElementById('settings-names').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    save(p => setNames(p, { name: fd.get('name'), oldName: fd.get('oldName'), newName: fd.get('newName') }), 'Names saved');
  });
  document.getElementById('settings-route').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    save(p => { p.route = routeFromForm(k => fd.get(k)); }, 'Answers saved');
  });
  document.getElementById('settings-managers')?.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = [...e.target.querySelectorAll('input[data-area]')];
    save(p => inputs.forEach(i => setAreaManager(p, i.dataset.area, i.value)), 'Managers saved');
  });
  document.querySelectorAll('.settings-remove-area').forEach(b => b.addEventListener('click', () => {
    save(p => removeArea(p, b.dataset.area), `${b.dataset.area} removed`);
  }));
  document.getElementById('settings-add-area').addEventListener('submit', e => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name') || '').trim();
    if (!name) return showErrors(e.target, [{ id: 'settings-new-area', text: GOVUK_TEXT.enterArea }]);
    const p = getProject(id);
    if (!addArea(p, name)) return showErrors(e.target, [{ id: 'settings-new-area', text: GOVUK_TEXT.areaThere }]);
    saveProject(p); ui.toast('Area added');
    rerender();
  });
  document.getElementById('settings-add-person').addEventListener('submit', e => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name') || '').trim();
    if (!name) return showErrors(e.target, [{ id: 'settings-new-person', text: GOVUK_TEXT.enterPerson }]);
    const p = getProject(id);
    if (!addPerson(p, name)) return showErrors(e.target, [{ id: 'settings-new-person', text: GOVUK_TEXT.personThere }]);
    saveProject(p); ui.toast('Name added');
    rerender();
  });
  document.querySelectorAll('.settings-remove-person').forEach(b => b.addEventListener('click', () => {
    save(p => removePerson(p, b.dataset.name));
  }));
  document.getElementById('settings-open-ai').addEventListener('click', () => ui.openAISettings?.(rerender, { showKey: true }));
}
