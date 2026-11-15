// The project home: where the project stands and what to do next.

import { getProject } from './store.js';
import { projectProgress, STATE_LABEL } from './progress.js';

const STATE_CHIP = { done: 'recon-ok', progress: 'recon-medium', todo: 'recon-low', blocked: 'recon-low' };

export function renderHome({ id }, ui) {
  const esc = ui.esc;
  const project = getProject(id);
  if (!project) return ui.renderNotFound();
  const { steps, next, overview } = projectProgress(project);
  const status = overview.summary.status;
  const started = (project.reconRuns || []).length > 0;

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'home')}
    <div class="page-head"><div><h1>${esc(project.name)}</h1>
      <p>Moving from ${esc(project.sourceSystem)} to ${esc(project.targetSystem)}</p></div></div>

    ${next ? `
      <div class="card home-next">
        <div>
          <div class="recon-eyebrow">Next</div>
          <div class="home-next-text">${esc(next.text)}</div>
          <div class="recon-sub">Step: ${esc(next.label)}</div>
        </div>
        <a class="btn btn-primary" href="#/projects/${id}/${next.path}">Go there</a>
      </div>` : ''}

    ${started ? `
      <div class="recon-status recon-status-${status.level} home-status">
        <div class="recon-status-label">Data checks: ${esc(status.label)}</div>
        <div class="recon-status-headline">${esc(status.headline)}</div>
      </div>` : ''}

    <div class="card">
      <ol class="home-steps">
        ${steps.map(s => `
          <li class="home-step home-step-${s.state}">
            <span class="home-step-num" aria-hidden="true">${s.state === 'done' ? '✓' : s.number}</span>
            <div class="home-step-body">
              <div class="home-step-title">${esc(s.label)} <span class="recon-chip ${STATE_CHIP[s.state]}">${STATE_LABEL[s.state]}</span></div>
              <div class="recon-sub">${esc(s.summary)}</div>
              ${s.screens.length > 1 && s.state !== 'blocked' ? `<div class="home-step-links">${s.screens.map(sc => `<a href="#/projects/${id}/${sc.path}">${esc(sc.label)}</a>`).join('')}</div>` : ''}
            </div>
            ${s.state === 'blocked' ? '' : `<a class="btn btn-secondary btn-sm" href="#/projects/${id}/${s.path}">Open</a>`}
          </li>`).join('')}
      </ol>
    </div>
  `);
  ui.attachLogout();
}
