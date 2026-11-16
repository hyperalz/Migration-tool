// One Help panel, opened from the top bar on every page. It holds how a move
// works (the five steps) and the words MapBridge uses, so the home page can
// stay about the work. Each screen keeps its own short "What do I do here?".

import { getProject } from './store.js';
import { INTRO, STEP_GUIDE, GLOSSARY } from './guide.js';
import { STEPS, STATE_LABEL, projectProgress } from './progress.js';

const STATE_CHIP = { done: 'recon-ok', progress: 'recon-medium', todo: 'recon-low', blocked: 'recon-low' };

/**
 * The panel's content. With a project's steps, each step also says where
 * that project stands.
 * @param {(v:string)=>string} esc
 * @param {object[]|null} steps  projectProgress(project).steps, or null
 */
export function helpHtml(esc, steps = null) {
  const step = s => {
    const g = STEP_GUIDE[s.key];
    const live = steps?.find(x => x.key === s.key);
    return `
      <details class="help-step">
        <summary><span class="help-step-num" aria-hidden="true">${live?.state === 'done' ? '✓' : STEPS.indexOf(s) + 1}</span>
          <span class="help-step-title">${esc(s.label)}</span>
          ${live ? `<span class="recon-chip ${STATE_CHIP[live.state]}">${esc(STATE_LABEL[live.state])}</span>` : ''}
          <span class="help-step-what">${esc(g.what)}</span></summary>
        <div class="help-step-body">
          <ol>${g.todo.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
          <p><strong>You are done when:</strong> ${esc(g.done)}</p>
          ${live?.summary ? `<p class="recon-sub">Where this move stands: ${esc(live.summary)}</p>` : ''}
        </div>
      </details>`;
  };
  return `
    <section aria-labelledby="help-how">
      <h3 id="help-how">How a move works</h3>
      <p>${esc(INTRO)}</p>
      <div class="help-steps">${STEPS.map(step).join('')}</div>
    </section>
    <section aria-labelledby="help-words">
      <h3 id="help-words">Words we use</h3>
      <dl class="help-words">${GLOSSARY.map(([term, meaning]) => `<dt>${esc(term)}</dt><dd>${esc(meaning)}</dd>`).join('')}</dl>
    </section>`;
}

function projectFromHash() {
  const m = /^#\/projects\/([^/]+)/.exec(location.hash);
  return m && m[1] !== 'new' ? getProject(m[1]) : null;
}

export function openHelp(esc, opener = null) {
  if (document.getElementById('help-panel')) return;
  const project = projectFromHash();
  const steps = project ? projectProgress(project).steps : null;
  const backdrop = document.createElement('div');
  backdrop.className = 'record-modal-backdrop';
  backdrop.innerHTML = `
    <div class="record-modal help-modal" id="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1">
      <div class="help-head">
        <h2 id="help-title">Help</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="help-close" aria-label="Close help">Close</button>
      </div>
      ${helpHtml(esc, steps)}
    </div>`;
  document.body.appendChild(backdrop);
  const panel = backdrop.querySelector('#help-panel');
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    opener?.focus?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  backdrop.querySelector('#help-close').addEventListener('click', close);
  panel.focus();
}

// One listener for every Help button, wherever it is drawn.
export function bindHelp(esc) {
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-open-help]');
    if (btn) { e.preventDefault(); openHelp(esc, btn); }
  });
}
