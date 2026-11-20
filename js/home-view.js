// The project home: the one thing to do now, everything left to do, and
// where each area is. How a move works and the word list live in Help.
// Detail is one click away, so the page is not a wall of text.

import { getProject } from './store.js';
import { projectProgress } from './progress.js';
import { INTRO, STEP_GUIDE, HOME_TEXT } from './guide.js';
import { areaBoard, todoList, STAGES } from './work-queue.js';
import { leadFigure, figureTone, boldLeadNumber, todoRowHtml, cellTone } from './figures.js';
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

  const topFig = top ? leadFigure(top.text) : null;
  const hero = top ? `
    <section class="card home-next">
      <div class="home-next-main">
        <div class="recon-eyebrow">Do this now · ${esc(top.area || topStep.label)}</div>
        ${topFig ? `
        <div class="home-next-fig">
          <span class="fig fig-big fig-${figureTone(top.id, topFig.what) || 'plain'}">${esc(topFig.n)}</span>
          <div><h2 class="home-next-text">${esc(topFig.action || topFig.what)}</h2>
            <p class="home-next-what">${esc(topFig.what[0].toUpperCase() + topFig.what.slice(1))}</p></div>
        </div>` : `
        <h2 class="home-next-text">${esc(top.text)}</h2>`}
        <a class="btn btn-primary" href="#/projects/${id}/${top.path}">Go to ${esc(topStep.label)}</a>
      </div>
    </section>` : `
    <section class="card home-next"><div class="home-next-main">
      <div class="recon-eyebrow">All done</div>
      <h2 class="home-next-text">${esc(HOME_TEXT.nothing)}</h2>
    </div></section>`;

  const SHOWN = 8;
  const item = t => todoRowHtml(t, { esc, href: `#/projects/${id}/${t.path}`, chip: areaChip(t.area) });
  const todoSection = todo.length > 1 ? `
    <h2 class="home-heading">Everything that needs doing, most urgent first</h2>
    <section class="card home-todo">
      <ul class="home-todo-list">${todo.slice(0, SHOWN).map(item).join('')}</ul>
      ${todo.length > SHOWN ? `<details><summary>Show ${todo.length - SHOWN} more</summary><ul class="home-todo-list">${todo.slice(SHOWN).map(item).join('')}</ul></details>` : ''}
    </section>` : '';

  const cell = c => `<td class="home-cell home-cell-${cellTone(c.state, c.text)}">${c.state === 'done' ? '<span aria-hidden="true">✓ </span>' : ''}${boldLeadNumber(c.text, esc)}</td>`;
  const boardSection = board.length ? `
    <h2 class="home-heading">Where each area is</h2>
    <section class="card home-board">
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
