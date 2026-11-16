// The project home: the one thing to do now, everything left to do, and
// where each area is. How a move works and the word list live in Help.
// Detail is one click away, so the page is not a wall of text.

import { getProject } from './store.js';
import { projectProgress } from './progress.js';
import { INTRO, STEP_GUIDE, HOME_TEXT } from './guide.js';
import { areaBoard, todoList, STAGES } from './work-queue.js';
import { areaPath } from './area-page.js';


export function renderHome({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const { steps, overview } = projectProgress(project);
  const status = overview.summary.status;
  const started = (project.reconRuns || []).length > 0;

  // Every open job, most important first. The top one is "do this now".
  const todo = todoList(project);
  const board = areaBoard(project, overview);
  const top = todo[0] || null;
  const topStep = top ? steps.find(s => s.key === top.step) : null;
  const guideTop = topStep ? STEP_GUIDE[topStep.key] : null;
  const areaChip = a => (a ? `<a class="home-area" href="${areaPath(id, a)}">${esc(a)}</a>` : '');

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
        <tbody>${board.map(r => `<tr><th scope="row"><a href="${areaPath(id, r.name)}">${esc(r.name)}</a></th>${STAGES.map(st => cell(r.cells[st.key])).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </section>` : '';

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'home')}
    <div class="page-head"><div><h1>${esc(project.name)}</h1>
      <p>Moving from ${esc(project.sourceSystem)} to ${esc(project.targetSystem)}</p></div></div>

    ${hero}
    ${todoSection}
    ${boardSection}

    <p class="home-help"><button type="button" class="btn-link" data-open-help aria-haspopup="dialog">How does a move work? Open Help</button></p>
  `);
  ui.attachLogout();
}
