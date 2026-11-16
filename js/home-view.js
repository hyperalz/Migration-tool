// The project home: one thing to do now, and the five steps at a glance.
// Detail is one click away, so the page is not a wall of text.

import { getProject } from './store.js';
import { projectProgress, STATE_LABEL } from './progress.js';
import { INTRO, STEP_GUIDE, GLOSSARY, HOME_TEXT } from './guide.js';
import { areaBoard, todoList, STAGES } from './work-queue.js';

const STATE_CHIP = { done: 'recon-ok', progress: 'recon-medium', todo: 'recon-low', blocked: 'recon-low' };

export function renderHome({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const { steps, next, overview } = projectProgress(project);
  const status = overview.summary.status;
  const started = (project.reconRuns || []).length > 0;
  const current = next ? steps.find(s => s.key === next.step) : null;
  const guide = current ? STEP_GUIDE[current.key] : null;

  // Every open job, most important first. The top one is "do this now".
  const todo = todoList(project);
  const board = areaBoard(project, overview);
  const top = todo[0] || null;
  const topStep = top ? steps.find(s => s.key === top.step) : null;
  const guideTop = topStep ? STEP_GUIDE[topStep.key] : null;
  const areaChip = a => (a ? `<span class="home-area">${esc(a)}</span>` : '');

  const hero = top ? `
    <section class="card home-next">
      <div class="home-next-main">
        <div class="recon-eyebrow">Do this now · ${esc(topStep.label)}</div>
        <h2 class="home-next-text">${top.area ? `${esc(top.area)}: ` : ''}${esc(top.text)}</h2>
        <p class="home-next-why">${esc(topStep.number === 1 ? INTRO : guideTop.what)}</p>
        <a class="btn btn-primary" href="#/projects/${id}/${top.path}">Go to ${esc(topStep.label)}</a>
        ${todo.length > 1 ? `<p class="recon-sub" style="margin-top:0.6rem">And ${todo.length - 1} more ${todo.length - 1 === 1 ? 'thing' : 'things'} to do, listed below.</p>` : ''}
      </div>
      ${started ? `<p class="home-next-status home-next-status-${status.level}"><strong>Data checks: ${esc(status.label)}.</strong> ${esc(status.headline)}</p>` : ''}
    </section>` : `
    <section class="card home-next"><div class="home-next-main">
      <div class="recon-eyebrow">All done</div>
      <h2 class="home-next-text">${esc(HOME_TEXT.nothing)}</h2>
    </div></section>`;

  const SHOWN = 8;
  const item = t => `<li><span class="home-todo-text">${areaChip(t.area)}${esc(t.text)}</span>
      <a class="btn btn-ghost btn-sm" href="#/projects/${id}/${t.path}">Open</a></li>`;
  const todoSection = todo.length > 1 ? `
    <h2 class="home-heading">Everything that needs doing</h2>
    <section class="card home-todo">
      <p class="recon-sub" style="margin:0 0 0.6rem">${esc(HOME_TEXT.todoHelp)}</p>
      <ol>${todo.slice(0, SHOWN).map(item).join('')}</ol>
      ${todo.length > SHOWN ? `<details><summary>Show ${todo.length - SHOWN} more</summary><ol start="${SHOWN + 1}">${todo.slice(SHOWN).map(item).join('')}</ol></details>` : ''}
    </section>` : '';

  const cell = c => `<td class="home-cell home-cell-${c.state}">${c.state === 'done' ? '<span aria-hidden="true">✓ </span>' : ''}${esc(c.text)}</td>`;
  const boardSection = board.length ? `
    <h2 class="home-heading">Where each area is</h2>
    <section class="card home-board">
      <p class="recon-sub" style="margin:0 0 0.6rem">${esc(HOME_TEXT.boardHelp)}</p>
      <div class="schema-preview"><table>
        <thead><tr><th scope="col">Area</th>${STAGES.map(st => `<th scope="col">${esc(st.label)}</th>`).join('')}</tr></thead>
        <tbody>${board.map(r => `<tr><th scope="row">${esc(r.name)}</th>${STAGES.map(st => cell(r.cells[st.key])).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>` : '';

  const row = s => `
    <details class="home-step home-step-${s.state}${current?.key === s.key ? ' home-step-current' : ''}">
      <summary>
        <span class="home-step-num" aria-hidden="true">${s.state === 'done' ? '✓' : s.number}</span>
        <span class="home-step-title">${esc(s.label)}</span>
        <span class="recon-chip ${STATE_CHIP[s.state]}">${STATE_LABEL[s.state]}</span>
        <span class="home-step-sum">${esc(STEP_GUIDE[s.key].what)}</span>
      </summary>
      <div class="home-step-body">
        <ol>${STEP_GUIDE[s.key].todo.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        <p><strong>You are done when:</strong> ${esc(STEP_GUIDE[s.key].done)}</p>
        <p class="recon-sub">Where it stands: ${esc(s.summary)}</p>
        ${s.state === 'blocked' ? '' : `<div class="home-step-links">
          ${s.screens.map(sc => `<a class="btn btn-secondary btn-sm" href="#/projects/${id}/${sc.path}">${esc(s.screens.length > 1 ? sc.label : `Open ${s.label}`)}</a>`).join('')}
        </div>`}
      </div>
    </details>`;

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'home')}
    <div class="page-head"><div><h1>${esc(project.name)}</h1>
      <p>Moving from ${esc(project.sourceSystem)} to ${esc(project.targetSystem)}</p></div></div>

    ${hero}
    ${todoSection}
    ${boardSection}

    <h2 class="home-heading">The five steps</h2>
    <div class="card home-steps">${steps.map(row).join('')}</div>

    <details class="card home-glossary">
      <summary>Words we use</summary>
      <dl>${GLOSSARY.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl>
    </details>
  `);
  ui.attachLogout();
}
