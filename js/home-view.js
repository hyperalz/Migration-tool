// The project home: where the project stands and what to do next.

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

  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  ui.mount(`
    ${ui.projectSteps(project, 'home')}
    <div class="page-head"><div><h1>${esc(project.name)}</h1>
      <p>Moving from ${esc(project.sourceSystem)} to ${esc(project.targetSystem)}</p></div></div>
    <p class="home-intro">${esc(INTRO)}</p>

    ${next ? `
      <div class="card home-next">
        <div>
          <div class="recon-eyebrow">Next · step ${steps.find(s => s.key === next.step).number} of ${steps.length}: ${esc(next.label)}</div>
          <div class="home-next-text">${esc(next.text)}</div>
          <div class="home-next-why">${esc(STEP_GUIDE[next.step].what)}</div>
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
              <p class="home-step-what">${esc(STEP_GUIDE[s.key].what)}</p>
              <details class="home-step-guide"${next && next.step === s.key ? ' open' : ''}>
                <summary>What do I do here?</summary>
                <ol>${STEP_GUIDE[s.key].todo.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
                <p><strong>You are done when:</strong> ${esc(STEP_GUIDE[s.key].done)}</p>
              </details>
              <div class="recon-sub">Where it stands: ${esc(s.summary)}</div>
              ${s.screens.length > 1 && s.state !== 'blocked' ? `<div class="home-step-links">${s.screens.map(sc => `<a href="#/projects/${id}/${sc.path}">${esc(sc.label)}</a>`).join('')}</div>` : ''}
            </div>
            ${s.state === 'blocked' ? '' : `<a class="btn btn-secondary btn-sm" href="#/projects/${id}/${s.path}">Open</a>`}
          </li>`).join('')}
      </ol>
    </div>

    <details class="card home-glossary">
      <summary>Words we use</summary>
      <dl>${GLOSSARY.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl>
    </details>
  `);
  ui.attachLogout();
}
