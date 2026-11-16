// The project home: one thing to do now, and the five steps at a glance.
// Detail is one click away, so the page is not a wall of text.

import { getProject } from './store.js';
import { projectProgress, STATE_LABEL } from './progress.js';
import { INTRO, STEP_GUIDE, GLOSSARY } from './guide.js';

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

  const hero = current ? `
    <section class="card home-next">
      <div class="home-next-main">
        <div class="recon-eyebrow">Do this now · step ${current.number} of ${steps.length}</div>
        <h2 class="home-next-text">${esc(next.text)}</h2>
        <p class="home-next-why">${esc(current.number === 1 ? INTRO : guide.what)}</p>
        <a class="btn btn-primary" href="#/projects/${id}/${next.path}">Go to ${esc(current.label)}</a>
      </div>
      <ol class="home-next-list" aria-label="How to do this step">
        ${guide.todo.map(t => `<li>${esc(t)}</li>`).join('')}
      </ol>
      ${started ? `<p class="home-next-status home-next-status-${status.level}"><strong>Data checks: ${esc(status.label)}.</strong> ${esc(status.headline)}</p>` : ''}
    </section>` : `
    <section class="card home-next"><div class="home-next-main">
      <div class="recon-eyebrow">All done</div>
      <h2 class="home-next-text">Every step is complete.</h2>
    </div></section>`;

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

    <h2 class="home-heading">The five steps</h2>
    <div class="card home-steps">${steps.map(row).join('')}</div>

    <details class="card home-glossary">
      <summary>Words we use</summary>
      <dl>${GLOSSARY.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl>
    </details>
  `);
  ui.attachLogout();
}
