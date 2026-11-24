import { renderProblems } from './problems-view.js';
import { projectProblems, isOpen } from './problems.js';
import { GOVUK_TEXT, passQuestionHtml, readPassAnswer, requiredErrors, summaryListHtml } from './govuk.js';
import { showErrors } from './govuk-view.js';
import { getCurrentUser, login, signup, logout, seedDemoUser, signInAsDemo, upgradeStoredPasswords, AUTH_TEXT } from './auth.js';
import {
  getProjects, getProject, saveProject, createProject, deleteProject,
  saveInvite, getInviteByToken, removeInvite, addMember, uid, getUsers, getInvites,
} from './store.js';
import { synergySample, impulseSample, suggestedMappings, cloneSample } from './sampleData.js';
import {
  parseJSONSchema, parseCSVTemplate, schemaStats, mappingProgress, readFileAsText,
  getSchemaColumn, valuesFormatMismatch,
} from './schema.js';
import {
  buildExportPackage, downloadJSON, downloadCSV, downloadExcel, generateSQLStubs, mappingsToRows, evidenceDigest, evidenceFingerprint,
} from './export.js';
import { MappingCanvas } from './mapping.js';
import {
  ensureVerification,
  verificationSummary, statusMeta, formatColumnRef, defaultVerification,
  filterMappings, columnTraceability, TRACE_STEPS, traceStepSummary,
  ensureProjectTeam, getProjectTeamNames, ensureProjectServiceAreas, getProjectServiceAreaNames,
  ensureMappingFields, countByServiceArea,
  nextTraceStepKey, traceStepVisualState, recordTraceStep, canRevertTraceStep, revertToTraceStep,
  countStepAttempts,
} from './verification.js';
import {
  buildTraceDashboardData, renderTraceDashboardHTML, scheduleDashboardCharts, destroyDashboardCharts,
} from './dashboard-charts.js';
import {
  getAISettings, saveAISettings, forgetAIKey, generateHeuristicSuggestions, generateLLMSuggestions, STRONG_SUGGESTION,
} from './ai-suggestions.js';
import { renderReconcile, renderReport, renderOverview, createFinanceDemoProject, DEMO_VERSION } from './reconcile-view.js';
import { renderHome } from './home-view.js';
import { fieldCheckIndex, trackerConflicts, checkNote, CHECK_LABEL } from './field-checks.js';
import { projectProgress, stepForScreen, STATE_LABEL, visibleScreens } from './progress.js';
import { SCREEN_GUIDE, PAGE_INTRO } from './guide.js';
import { templateImportCard, bindTemplateImport } from './template-import-view.js';
import { mergeSchema } from './template-import.js';
import { DELIVERY_TEXT, compareDelivery, needsReview, applyDelivery, deliveryRecord, deliverySummaryText, stillExpected, parseExpected, recentTables } from './deliveries.js';
import { screenshotCard, bindScreenshotDictionary } from './screenshot-dictionary-view.js';
import { traceCard, bindTrace } from './trace-view.js';
import { PROFILES, PROFILE_TEXT, SOURCE_KIND, LIST_TYPE, listTypeOf, getProfile, profileToSchema, profileRecord, profileFieldCount } from './system-profiles.js';
import { renderSuppliers } from './supplier-view.js';
import { RECORD_TEXT, retireMatch, retireMissing, recordNotMoving, withdrawDecision, unmatchedOldFields, decisionSummary, findFields, resultLine } from './field-record.js';
import { renderSignoffReport } from './signoff-report.js';
import { SETUP_TEXT, ROUTES, SIDE_WORD, routeFor, chosenRoute, answersFromChoice, originLine, listOrigin, recordOrigin, matchesUsing, orphanMatches, addResultText } from './setup-routes.js';
import { screenTables } from './trace.js';
import { renderExecutive } from './executive-view.js';
import { oldName, newName, oldLabel, newLabel } from './words.js';
import { systemTag, fieldTag, fieldPairHtml } from './system-tags.js';
import { bindHelp } from './help-view.js';
import { renderArea } from './area-view.js';
import { renderSettings } from './settings-view.js';
import { ROUTE_TEXT, routeQuestionsHtml, routeFromForm, fieldListsPlan, routeAnswerRows, firstBox } from './route.js';

let canvasInstance = null;
let toastTimer = null;

const routes = {
  '/login': renderLogin,
  '/signup': renderSignup,
  '/dashboard': renderDashboard,
  '/demo': renderDemo,
  '/suppliers': () => renderSuppliers({ nav, mount, esc, toast }),
  '/projects/new': renderNewProject,
  '/projects/:id': params => renderHome(params, reconcileUI()),
  '/projects/:id/setup': renderSetup,
  '/projects/:id/invite': renderInvite,
  '/projects/:id/map': renderMap,
  '/projects/:id/verify': renderVerify,
  '/projects/:id/reconcile': params => renderReconcile(params, reconcileUI()),
  '/projects/:id/reconcile/overview': params => renderOverview(params, reconcileUI()),
  '/projects/:id/areas/:area': params => renderArea(params, reconcileUI()),
  '/projects/:id/problems': params => renderProblems(params, reconcileUI()),
  '/projects/:id/executive': params => renderExecutive(params, reconcileUI()),
  '/projects/:id/settings': params => renderSettings(params, { ...reconcileUI(), openAISettings: openAISettingsModal }),
  '/projects/:id/reconcile/:runId': params => renderReport(params, reconcileUI()),
  '/projects/:id/export': renderExport,
  '/projects/:id/report': params => renderSignoffReport(params, { ...reconcileUI(), getProject, getCurrentUser }),
  '/invite/:token': renderAcceptInvite,
};

export function initApp() {
  seedDemoUser();
  upgradeStoredPasswords();
  bindHelp(esc);
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/login';
  route();
}

function route() {
  const [hash, anchor] = (location.hash.slice(1) || '/login').split('#');
  const user = getCurrentUser();

  if (!user && !['/login', '/signup', '/invite', '/demo', '/suppliers'].some(p => hash.startsWith(p))) {
    location.hash = '#/login';
    return;
  }

  for (const [pattern, handler] of Object.entries(routes)) {
    const params = matchRoute(pattern, hash);
    if (params !== null) {
      closeDrawer();
      canvasInstance = null;
      handler(params);
      if (anchor) document.getElementById(anchor)?.scrollIntoView();
      return;
    }
  }
  renderNotFound();
}

function matchRoute(pattern, path) {
  const pParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (pParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = pathParts[i];
    else if (pParts[i] !== pathParts[i]) return null;
  }
  return params;
}

// Shared page furniture handed to the reconciliation screens.
function reconcileUI() {
  return { nav, projectSteps, mount, attachLogout, toast, esc, renderNotFound };
}

function mount(html) {
  document.getElementById('app-main').innerHTML = html;
}

function nav(title = '') {
  const user = getCurrentUser();
  return `
    <a href="#app-main" class="skip-link" data-skip-link>${GOVUK_TEXT.skip}</a>
    <nav class="app-nav">
      <a href="#/dashboard" class="logo"><span class="logo-mark">MB</span> MapBridge</a>
      <div style="display:flex;align-items:center;gap:0.75rem;font-size:0.85rem;color:var(--muted)">
        ${title ? `<span>${esc(title)}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-open-help aria-haspopup="dialog">Help</button>
        ${user ? `<span>${user.name}</span><button class="btn btn-ghost btn-sm" id="logout-btn">Sign out</button>` : ''}
      </div>
    </nav>`;
}

// The step bar. `active` is the key of the screen being shown ('home',
// 'setup', 'invite', 'map', 'verify', 'reconcile', 'overview', 'export').
// Each step shows its state, worked out from the project's data.
function projectSteps(project, active) {
  const { steps } = projectProgress(project);
  const current = stepForScreen(active);
  const chips = steps.map(s => {
    const isActive = current?.key === s.key;
    const cls = ['step-chip', isActive ? 'active' : '', `step-${s.state}`].filter(Boolean).join(' ');
    const mark = s.state === 'done' ? '✓ ' : '';
    return `<a href="#/projects/${project.id}/${s.path}" class="${cls}" title="${esc(`${STATE_LABEL[s.state]}. ${s.summary}`)}"${isActive ? ' aria-current="step"' : ''}>${mark}${s.number}. ${esc(s.label)}</a>`;
  }).join('');
  const shownScreens = visibleScreens(current);
  const sub = shownScreens.length > 1
    ? `<div class="steps-sub">${shownScreens.map(sc =>
      `<a href="#/projects/${project.id}/${sc.path}" class="${sc.key === active ? 'active' : ''}">${esc(sc.label)}</a>`).join('')}</div>`
    : '';
  return `<div class="steps-bar"><a href="#/projects/${project.id}" class="step-chip step-home ${active === 'home' ? 'active' : ''}">Home</a>${chips}
    ${problemsChip(project, active)}<a href="#/projects/${project.id}/executive" class="step-chip step-exec ${active === 'executive' ? 'active' : ''}"${active === 'executive' ? ' aria-current="page"' : ''}>Executive overview</a><a href="#/projects/${project.id}/settings" class="step-chip step-settings ${active === 'settings' ? 'active' : ''}"${active === 'settings' ? ' aria-current="page"' : ''}>Settings</a></div>${sub}${PAGE_INTRO[active] ? `<p class="page-intro">${esc(PAGE_INTRO[active])}</p>` : ''}${screenHelp(active)}`;
}

// "What do I do here?" for the screen being shown. Open until the reader
// closes it; after that it stays closed on that screen.
function helpClosed(screen) {
  try { return localStorage.getItem(`mapbridge_help_closed_${screen}`) === '1'; } catch { return false; }
}

// A link to the problems log, once there is anything in it, with how many are open.
function problemsChip(project, active) {
  const rows = projectProblems(project);
  if (!rows.length) return '';
  const open = rows.filter(isOpen).length;
  const on = active === 'problems';
  return `<a href="#/projects/${project.id}/problems" class="step-chip step-problems ${on ? 'active' : ''} ${open ? 'has-open' : ''}"${on ? ' aria-current="page"' : ''}>Problems${open ? ` <span class="problems-count">${open} open</span>` : ''}</a>`;
}

function screenHelp(screen) {
  const lines = SCREEN_GUIDE[screen];
  if (!lines || screen === 'home') return '';
  return `<details class="step-help" data-help-screen="${screen}"${helpClosed(screen) ? '' : ' open'}>
    <summary>What do I do here?</summary>
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  </details>`;
}

// The toggle event does not bubble, so listen in the capture phase.
document.addEventListener('toggle', e => {
  const screen = e.target?.dataset?.helpScreen;
  if (!screen) return;
  try { localStorage.setItem(`mapbridge_help_closed_${screen}`, e.target.open ? '0' : '1'); } catch { /* storage unavailable */ }
}, true);

// The skip link moves focus to the main content without changing the route.
document.addEventListener('click', e => {
  const link = e.target.closest?.('[data-skip-link]');
  if (!link) return;
  e.preventDefault();
  const main = document.getElementById('app-main');
  if (!main) return;
  main.setAttribute('tabindex', '-1');
  main.focus();
});

function attachLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    logout();
    location.hash = '#/login';
  });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function closeDrawer() {
  document.getElementById('mapping-drawer')?.classList.remove('open');
  document.getElementById('drawer-backdrop')?.classList.remove('open');
}

// "Try the demo": no sign-up. Signs in as the demo account and opens the
// demo project, making it the first time.
function renderDemo() {
  signInAsDemo();
  const me = getCurrentUser();
  const mine = getProjects().filter(p => p.demo && p.members.some(m => m.userId === me.id));
  // An older copy of the demo is replaced, so everyone sees the current one.
  for (const p of mine) if (p.demoVersion !== DEMO_VERSION) deleteProject(p.id);
  const project = mine.find(p => p.demoVersion === DEMO_VERSION) || createFinanceDemoProject(me);
  location.replace(`#/projects/${project.id}`);
}

function renderLogin() {
  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="auth-page card">
      <h1>MapBridge</h1>
      <p>MapBridge helps you move data from an old system to a new one. You match every field, track testing in test and live, and get each area signed off.</p>
      <a class="btn btn-primary" href="#/demo" style="width:100%;text-align:center">Try the demo (no sign-up)</a>
      <p class="recon-sub" style="margin:0.4rem 0 1.25rem">Opens a finance system move part way through testing.</p>
      <h2 class="auth-or">Or sign in</h2>
      <form id="login-form" novalidate>
        <div class="field"><label for="login-email">Email</label><input id="login-email" type="email" name="email" autocomplete="email"></div>
        <div class="field"><label for="login-password">Password</label><input id="login-password" type="password" name="password" autocomplete="current-password"></div>
        <button class="btn btn-secondary" type="submit" style="width:100%">Sign in</button>
      </form>
      <p class="recon-sub" style="margin-top:0.75rem">${esc(AUTH_TEXT.demoNote)}</p>
      <p style="margin-top:1rem;font-size:0.88rem;color:var(--muted)">No account? <a href="#/signup" style="color:var(--brand);font-weight:600">Create one</a></p>
      <p style="margin-top:0.5rem;font-size:0.88rem;color:var(--muted)">Supplier? <a href="#/suppliers">Register your system's field list</a></p>
    </div>
  `);
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (showErrors(e.target, requiredErrors([
      { id: 'login-email', value: fd.get('email'), text: GOVUK_TEXT.enterEmail },
      { id: 'login-password', value: fd.get('password'), text: GOVUK_TEXT.enterPassword },
    ]))) return;
    try {
      await login({ email: fd.get('email'), password: fd.get('password') });
      location.hash = '#/dashboard';
    } catch (err) {
      showErrors(e.target, [{ id: 'login-email', text: err.message }]);
    }
  });
}

function renderSignup() {
  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="auth-page card">
      <h1>Create account</h1>
      <p>Local demo — no server, no real auth.</p>
      <form id="signup-form" novalidate>
        <div class="field"><label for="signup-name">Name</label><input id="signup-name" name="name" autocomplete="name"></div>
        <div class="field"><label for="signup-email">Email</label><input id="signup-email" type="email" name="email" autocomplete="email"></div>
        <div class="field"><label for="signup-password">Password</label><p class="route-hint">At least 6 letters or numbers.</p><input id="signup-password" type="password" name="password" autocomplete="new-password"></div>
        <div class="field"><label for="signup-role">Organisation role</label>
          <select id="signup-role" name="orgRole">
            <option value="consultant">Delivery consultant</option>
            <option value="la">Local Authority</option>
            <option value="vendor">System supplier</option>
          </select>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%">Create account</button>
      </form>
      <p style="margin-top:1rem;font-size:0.88rem;color:var(--muted)">Already have an account? <a href="#/login" style="color:var(--brand);font-weight:600">Sign in</a></p>
    </div>
  `);
  document.getElementById('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errors = requiredErrors([
      { id: 'signup-name', value: fd.get('name'), text: GOVUK_TEXT.enterName },
      { id: 'signup-email', value: fd.get('email'), text: GOVUK_TEXT.enterEmail },
      { id: 'signup-password', value: fd.get('password'), text: GOVUK_TEXT.enterPassword },
    ]);
    if (!errors.some(x => x.id === 'signup-password') && String(fd.get('password')).length < 6) {
      errors.push({ id: 'signup-password', text: 'Your password must be at least 6 letters or numbers long' });
    }
    if (showErrors(e.target, errors)) return;
    try {
      await signup(Object.fromEntries(fd));
      location.hash = '#/dashboard';
    } catch (err) {
      showErrors(e.target, [{ id: 'signup-email', text: err.message }]);
    }
  });
}

function renderDashboard() {
  const user = getCurrentUser();
  const projects = getProjects().filter(p =>
    p.members.some(m => m.userId === user.id)
  );

  document.getElementById('app-shell').innerHTML = nav('Projects') + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="page-head">
      <div><h1>Your projects</h1><p>Each project is one move from an old system to a new one. When it is finished, download the evidence pack and close the project.</p></div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="btn btn-ghost" id="finance-demo-btn">Try the finance demo</button>
        <a href="#/projects/new" class="btn btn-primary">+ New project</a>
      </div>
    </div>
    ${projects.length ? `<div class="project-grid">${projects.map(p => `
      <a href="#/projects/${p.id}" class="project-card">
        <h3>${esc(p.name)}</h3>
        <div class="project-meta">${esc(p.sourceSystem)} → ${esc(p.targetSystem)}</div>
        <div class="project-next">${(next => (next ? `Next: ${esc(next.text)}` : 'All steps complete'))(projectProgress(p).next)}</div>
      </a>
    `).join('')}</div>` : `
      <div class="empty-state card">
        <h2>New to MapBridge?</h2>
        <p>Start with the demo project. It shows a finance system move part way through testing, so you can see each step before you start your own.</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:1rem">
          <a href="#/demo" class="btn btn-primary">Open the demo project</a>
          <a href="#/projects/new" class="btn btn-secondary">Start your own project</a>
        </div>
      </div>`}
  `);
  attachLogout();
  document.getElementById('finance-demo-btn').addEventListener('click', () => {
    const demo = createFinanceDemoProject(user);
    toast('Finance demo project created');
    location.hash = `#/projects/${demo.id}`;
  });
}

function renderNewProject() {
  document.getElementById('app-shell').innerHTML = nav('New project') + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="page-head"><div><h1>New project</h1><p>Name the move and the two systems. MapBridge uses these names on every screen. Next, you add the field lists.</p></div></div>
    <div class="card" style="max-width:520px">
      <form id="new-project-form">
        <div class="field"><label>Project name</label><input name="name" placeholder="For example, Finance system move" required></div>
        <div class="field"><label for="np-old">The old system's name</label>
          <input id="np-old" name="sourceSystem" placeholder="For example, the system you use now">
        </div>
        <div class="field"><label for="np-new">The new system's name</label>
          <input id="np-new" name="targetSystem" placeholder="For example, the system you are moving to">
        </div>
        <button class="btn btn-primary" type="submit">Create project</button>
      </form>
    </div>
  `);
  attachLogout();
  document.getElementById('new-project-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const project = createProject({
      name: fd.get('name'),
      sourceSystem: fd.get('sourceSystem'),
      targetSystem: fd.get('targetSystem'),
      ownerId: getCurrentUser().id,
    });
    project.route = routeFromForm(() => null);
    saveProject(project);
    toast('Project created');
    location.hash = `#/projects/${project.id}/setup`;
  });
}

// What a side with a list is doing: 'add' (adding more fields),
// 'replace-confirm' (asked to replace, not yet confirmed) or 'replace'.
// Held in memory only: a reload shows the finished state.
const setupMode = new Map();
// A delivery waiting for the person to choose which version of each re-sent table to keep.
const setupPending = new Map();

/**
 * Add a delivery to one side's list and log it. With `replacing`, the list
 * starts again from the delivery.
 */
function applyAndRecord(p, side, incoming, origin, file, useNew, replacing) {
  const key = side === 'old' ? 'sourceSchema' : 'targetSchema';
  const at = new Date().toISOString();
  const had = Boolean(p[key]?.tables?.length);
  const res = applyDelivery(replacing ? null : p[key], incoming, { useNewVersion: useNew, at });
  p[key] = { ...res.schema, system: p[key]?.system || res.schema.system };
  p.deliveries = [...(p.deliveries || []), deliveryRecord({ side, origin, file, at, by: getCurrentUser()?.name, comparison: res.comparison, useNewVersion: useNew, replaced: replacing && had })];
  return { schema: p[key], added: res.summary.addedFields, summary: res.summary, record: p.deliveries.at(-1) };
}

/** The choice for each re-sent table, as HTML. Empty when no table needs one. */
function deliveryReviewHtml(project, side, incoming) {
  const key = side === 'old' ? 'sourceSchema' : 'targetSchema';
  const review = needsReview(compareDelivery(project[key], incoming));
  if (!review.length) return '';
  const list = (label, items) => items.length ? `<li>${label}: ${items.map(x => esc(x)).join(', ')}</li>` : '';
  return `
    <div class="delivery-review" role="group" aria-labelledby="delivery-review-title">
      <h4 id="delivery-review-title">${esc(DELIVERY_TEXT.reviewTitle)}</h4>
      <p class="recon-sub" style="margin:0 0 0.6rem">${esc(DELIVERY_TEXT.reviewLead)}</p>
      ${review.map(c => `
        <div class="delivery-table">
          <strong>${esc(c.name)}</strong>
          <ul class="delivery-diff">
            ${list('New fields', c.added)}
            ${list('No longer in this version', c.removed)}
            ${c.changed.length ? `<li>Changed: ${c.changed.map(x => `${esc(x.name)} (${x.what.map(w => `${w} ${esc(x.before[w])} → ${esc(x.after[w])}`).join('; ')})`).join(', ')}</li>` : ''}
          </ul>
          <label class="delivery-choice"><input type="radio" name="use-new-${esc(c.name)}" value="new" data-table="${esc(c.name)}" checked> ${esc(DELIVERY_TEXT.useNew)}</label>
          <label class="delivery-choice"><input type="radio" name="use-new-${esc(c.name)}" value="keep" data-table="${esc(c.name)}"> ${esc(DELIVERY_TEXT.keepCurrent)}</label>
        </div>`).join('')}
    </div>`;
}

function readUseNew(container) {
  return new Set([...(container?.querySelectorAll('input[value="new"][data-table]:checked') || [])].map(i => i.dataset.table));
}

function renderSetup({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  const SIDE = { old: 'source', new: 'target' };
  const label = side => side === 'old' ? oldLabel(project) : newLabel(project);
  const hasList = side => Boolean(project[SIDE[side] + 'Schema']?.tables?.length);
  const mode = side => setupMode.get(`${id}:${side}`) || null;
  const chosen = side => chosenRoute(project, side);

  const routeOptions = (side, legend) => `
    <fieldset class="setup-routes">
      <legend>${esc(legend)}</legend>
      ${ROUTES[side].map(r => `
        <label class="setup-route ${chosen(side) === r.key ? 'is-on' : ''}">
          <input type="radio" name="setup-route-${side}" value="${r.key}" data-side="${side}" ${chosen(side) === r.key ? 'checked' : ''}>
          <span class="setup-route-text"><span class="setup-route-title">${esc(r.title)}</span>
          <span class="setup-route-best">${esc(r.best)}</span></span>
        </label>`).join('')}
    </fieldset>`;

  const orphanNote = side => {
    const orphans = orphanMatches(project, side);
    if (!orphans.length) return '';
    const names = orphans.slice(0, 3).map(m => `${m.sourceColumn} → ${m.targetColumn}`).join(', ');
    return `
      <div class="alert alert-warn setup-orphans" role="note">
        ${orphans.length} ${orphans.length === 1 ? 'match uses a field' : 'matches use fields'} that ${orphans.length === 1 ? 'is' : 'are'} no longer in this list: ${esc(names)}${orphans.length > 3 ? ` and ${orphans.length - 3} more` : ''}.
        Match ${orphans.length === 1 ? 'it' : 'them'} again on the Match screen, or remove ${orphans.length === 1 ? 'it' : 'them'}.
        <div style="margin-top:0.5rem"><button type="button" class="btn btn-ghost btn-sm setup-remove-orphans" data-side="${side}">Remove ${orphans.length === 1 ? 'this match' : `these ${orphans.length} matches`}</button></div>
      </div>`;
  };

  const profileNote = side => {
    const rec = project[SIDE[side] + 'Profile'];
    if (!rec) return '';
    const type = LIST_TYPE[rec.listType === 'statutory' ? 'statutory' : 'system'];
    return `<p class="recon-sub profile-source">${esc(type.short.charAt(0).toUpperCase() + type.short.slice(1))}: ${esc(rec.system)}. ${esc(rec.source)}${rec.listType === 'statutory' ? ` ${esc(LIST_TYPE.statutory.note)}` : ''}</p>`;
  };

  const sideCard = side => {
    const list = hasList(side);
    const m = mode(side);
    const stats = schemaStats(project[SIDE[side] + 'Schema']);
    const word = SIDE_WORD[side];
    let body;
    const pending = setupPending.get(`${id}:${side}`);
    if (pending) body = `
      <div class="setup-pending" id="setup-pending-${side}">
        <p style="margin:0.5rem 0"><strong>${esc(pending.file || 'This delivery')}</strong> is ready to add.</p>
        ${deliveryReviewHtml(project, side, pending.incoming)}
        <div class="setup-actions">
          <button type="button" class="btn btn-primary btn-sm setup-pending-apply" data-side="${side}">${esc(DELIVERY_TEXT.apply)}</button>
          <button type="button" class="btn-link setup-pending-cancel" data-side="${side}">${esc(DELIVERY_TEXT.cancel)}</button>
        </div>
      </div>`;
    else if (!list) body = routeOptions(side, SETUP_TEXT.question(word));
    else if (m === 'add') body = `${routeOptions(side, SETUP_TEXT.questionMore(word))}
      <p class="recon-sub" style="margin:0.5rem 0 0">${esc(SETUP_TEXT.addNote)}</p>
      <button type="button" class="btn-link setup-cancel" data-side="${side}">${esc(SETUP_TEXT.keep)}</button>`;
    else if (m === 'replace-confirm') body = `
      <div class="alert alert-warn" role="alert" style="margin:0.5rem 0">${esc(SETUP_TEXT.replaceWarn(matchesUsing(project, side), word))}</div>
      <div class="setup-actions">
        <button type="button" class="btn btn-secondary btn-sm setup-replace-yes" data-side="${side}">${esc(SETUP_TEXT.replaceConfirm)}</button>
        <button type="button" class="btn-link setup-cancel" data-side="${side}">${esc(SETUP_TEXT.keep)}</button>
      </div>`;
    else if (m === 'replace') body = `${routeOptions(side, SETUP_TEXT.questionReplace(word))}
      <button type="button" class="btn-link setup-cancel" data-side="${side}">${esc(SETUP_TEXT.keep)}</button>`;
    else body = `
      <div class="setup-actions">
        <button type="button" class="btn btn-secondary btn-sm setup-add" data-side="${side}">${esc(SETUP_TEXT.addMore)}</button>
        <button type="button" class="btn-link setup-replace" data-side="${side}">${esc(SETUP_TEXT.replace)}</button>
      </div>
      ${renderSchemaPreview(project[SIDE[side] + 'Schema'], stats)}`;
    return `
      <section class="card setup-side sys-side-${side}" id="setup-side-${side}">
        ${systemTag(side, esc)}
        <h2 class="setup-side-title">${esc((side === 'old' ? project.sourceSystem : project.targetSystem) || (side === 'old' ? 'The system you use now' : 'The system you are moving to'))}</h2>
        ${list ? `<p class="setup-done"><span aria-hidden="true">✓</span> ${esc(originLine(project, side))}</p>${profileNote(side)}${orphanNote(side)}` : ''}
        ${body}
      </section>`;
  };

  const uploadZone = (side, origin, hint) => `
    <div class="upload-zone" id="${SIDE[side]}-upload" data-origin="${origin}">
      <input type="file" id="${SIDE[side]}-file" accept="${origin === 'db' ? '.json' : '.json,.csv'}">
      <p><strong>${origin === 'db' ? 'Add the connector file' : 'Add a field list file'}</strong> (drag it here, or choose a file)</p>
      <p style="font-size:0.82rem;color:var(--muted);margin-top:0.35rem">${esc(hint)}</p>
    </div>`;

  const tool = (side, key) => {
    if (key === 'db') return `
      <ol class="setup-steps">
        <li>Ask your IT team to run the MapBridge connector once against the ${esc(SIDE_WORD[side])} system's database. It works with SQL Server and Oracle.</li>
        <li>It only reads the names and types of tables and fields, never records. It saves them in a file.</li>
        <li>Add that file below.</li>
      </ol>
      <p class="recon-sub" style="margin:0 0 0.75rem"><a href="https://github.com/hyperalz/Migration-tool/tree/main/connector" target="_blank" rel="noopener">How IT runs the connector</a> · <a href="it-and-dpo.html" target="_blank" rel="noopener">Security note for IT and data protection</a></p>
      ${uploadZone(side, 'db', 'The file the connector made, ending in .json.')}`;
    if (key === 'file') return `
      ${uploadZone(side, 'file', 'A CSV or JSON file. Row 1 holds the field names. Rows 2 to 4 can hold types, what each field means and the values it allows.')}
      <p class="recon-sub" style="margin:0.6rem 0 0"><button type="button" class="btn-link" id="load-${SIDE[side]}-sample">Try a sample list instead</button></p>
      ${renderSchemaExamples()}`;
    if (key === 'screens') {
      const shots = screenTables(project.sourceSchema).length > 0;
      return `${screenshotCard(project, esc)}
        ${shots ? `<h4 class="setup-then">Then: link the screen names to the real fields</h4>
        <p class="recon-sub" style="margin:0 0 0.5rem">Screen names are not the names of the fields in the database. If you can still reach it, this finds the real ones.</p>
        ${traceCard(project, esc)}` : ''}`;
    }
    if (key === 'supplier') return templateImportCard(project, esc);
    if (key === 'profile') return profileChooser(side);
    return '';
  };

  const profileChooser = side => {
    if (!PROFILES.length) return `<p>${esc(PROFILE_TEXT.none)}</p>`;
    let first = true;
    const option = pr => {
      const html = `
          <label class="profile-option">
            <input type="radio" name="profile-${side}" value="${esc(pr.id)}" ${first ? 'checked' : ''}>
            <span class="profile-option-text">
              <span class="profile-option-title">${esc(pr.system)}</span>
              <span class="profile-badges"><span class="profile-type profile-type-${listTypeOf(pr)}">${esc(LIST_TYPE[listTypeOf(pr)].label)}</span><span class="profile-badge profile-badge-${esc(pr.source.kind)}">${esc(SOURCE_KIND[pr.source.kind]?.label || '')}</span></span>
              <span class="profile-option-meta">${profileFieldCount(pr)} fields in ${pr.tables.length} tables · ${esc(pr.version)} · ${esc(PROFILE_TEXT.checked(pr.checked))}</span>
              <span class="profile-option-note">${esc(pr.note)}</span>
              <span class="profile-option-meta">From: <a href="${esc(pr.source.url)}" target="_blank" rel="noopener">${esc(pr.source.label)}</a></span>
            </span>
          </label>`;
      first = false;
      return html;
    };
    const group = type => {
      const lists = PROFILES.filter(pr => listTypeOf(pr) === type);
      if (!lists.length) return '';
      return `
        <div class="profile-group">
          <h3 class="profile-group-title">${esc(LIST_TYPE[type].plural)}</h3>
          <p class="profile-group-note">${esc(LIST_TYPE[type].note)}</p>
          ${lists.map(option).join('')}
        </div>`;
    };
    return `
      <fieldset class="profile-pick">
        <legend>${esc(PROFILE_TEXT.pick)}</legend>
        ${group('system')}${group('statutory')}
      </fieldset>
      <p class="recon-sub" style="margin:0.5rem 0 0.75rem">${esc(PROFILE_TEXT.starter)}</p>
      <button type="button" class="btn btn-primary btn-sm profile-use" data-side="${side}">${esc(PROFILE_TEXT.use)}</button>`;
  };


  // A side's tool stays open while there is no list, while changing, and for
  // the two ways in that have results or a follow-on step to look at.
  const panel = side => {
    const key = chosen(side);
    if (!key) return '';
    const m = mode(side);
    if (m === 'replace-confirm' || setupPending.has(`${id}:${side}`)) return '';
    const showAfter = key === 'screens' || key === 'supplier';
    if (hasList(side) && !m && !showAfter) return '';
    const r = routeFor(side, key);
    return `
      <section class="card setup-panel" id="setup-panel-${side}">
        <h3 class="setup-panel-title">${esc(label(side))}: ${esc(r.title.toLowerCase())}${m === 'add' ? ' (adding to the list)' : m === 'replace' ? ' (replacing the list)' : ''}</h3>
        <p class="recon-sub" style="margin:0 0 0.9rem">${esc(r.gives)}</p>
        ${tool(side, key)}
      </section>`;
  };

  const both = hasList('old') && hasList('new');
  mount(`
    ${projectSteps(project, 'setup')}
    <div class="page-head"><div><h1>${esc(SETUP_TEXT.title)}</h1>
      <p>${esc(SETUP_TEXT.lead)} ${esc(SETUP_TEXT.noRecords)}</p></div></div>
    <div class="setup-flow" aria-hidden="true">
      <span class="setup-flow-box sys-flow-old ${hasList('old') ? 'is-done' : ''}">${hasList('old') ? '✓ ' : ''}Old system's fields</span>
      <span class="setup-flow-arrow">→</span>
      <span class="setup-flow-box setup-flow-match">Match</span>
      <span class="setup-flow-arrow">←</span>
      <span class="setup-flow-box sys-flow-new ${hasList('new') ? 'is-done' : ''}">${hasList('new') ? '✓ ' : ''}New system's fields</span>
    </div>
    <div class="grid-2 setup-sides">${sideCard('old')}${sideCard('new')}</div>
    ${panel('old')}
    ${panel('new')}
    ${setupExtras(project, esc)}
    <div class="setup-next">
      ${both ? `<p class="setup-next-text">${esc(SETUP_TEXT.bothReady)}</p>
        <a href="#/projects/${id}/map" class="btn btn-primary">${esc(SETUP_TEXT.next)} →</a>`
        : `<p class="recon-sub">${esc(!hasList('old') ? SETUP_TEXT.oneMissing('old') : SETUP_TEXT.oneMissing('new'))}</p>`}
    </div>
  `);

  // The tools inside the panels open straight away: the panel heading already names them.
  document.querySelectorAll('.setup-panel details.template-import').forEach(d => { d.open = true; });
  // The supplier spreadsheet and the screenshot tool add to a list. When the
  // person chose to replace it, the old list is cleared just before they apply.
  let replacingNow = false;
  let beforeShots = null;
  const before = (side, origin) => p => {
    const key = `${id}:${side}`;
    const sk = SIDE[side];
    replacingNow = setupMode.get(key) === 'replace';
    if (side === 'old') beforeShots = p.sourceSchema ? structuredClone(p.sourceSchema) : null;
    if (replacingNow) {
      p[sk + 'Schema'] = null;
      recordOrigin(p, side, origin, 'replace');
    } else {
      if (!p[sk + 'Origin'] && p[sk + 'Schema']?.tables?.length) p[sk + 'Origin'] = listOrigin(p, side);
      recordOrigin(p, side, origin, 'add');
    }
    setupMode.delete(key);
  };
  bindTemplateImport(id, reconcileUI(), () => renderSetup({ id }), {
    beforeApply: before('new', 'supplier'),
    reviewHtml: (proj, incoming) => setupMode.get(`${id}:new`) === 'replace' ? '' : deliveryReviewHtml(proj, 'new', incoming),
    applyTarget: (p, incoming, file, previewEl) => applyAndRecord(p, 'new', incoming, 'supplier', file, readUseNew(previewEl), replacingNow),
  });
  bindScreenshotDictionary(id, { ...reconcileUI(), openAISettings: openAISettingsModal }, () => renderSetup({ id }), {
    beforeApply: before('old', 'screens'),
    afterApply: (p, incoming) => {
      const at = new Date().toISOString();
      p.deliveries = [...(p.deliveries || []), deliveryRecord({ side: 'old', origin: 'screens', file: 'Pictures of screens', at, by: getCurrentUser()?.name, comparison: compareDelivery(beforeShots, incoming) })];
    },
  });

  bindTrace(id, reconcileUI(), () => renderSetup({ id }));
  attachLogout();
  if (document.getElementById('source-upload')) setupUpload('source', id);
  if (document.getElementById('target-upload')) setupUpload('target', id);

  document.querySelectorAll('input[name^="setup-route-"]').forEach(input => {
    input.addEventListener('change', () => {
      const side = input.dataset.side;
      const p = getProject(id);
      p.setupRoutes = { ...(p.setupRoutes || {}), [side]: input.value };
      p.route = answersFromChoice(p.route, side, input.value);
      saveProject(p);
      renderSetup({ id });
      document.getElementById(`setup-panel-${side}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });
  document.querySelectorAll('.profile-use').forEach(b => b.addEventListener('click', () => {
    const side = b.dataset.side;
    const picked = document.querySelector(`input[name="profile-${side}"]:checked`);
    const profile = picked && getProfile(picked.value);
    if (!profile) return;
    const p = getProject(id);
    const sk = SIDE[side];
    const key = `${id}:${side}`;
    const incoming = profileToSchema(profile);
    const existing = p[sk + 'Schema']?.tables?.length ? p[sk + 'Schema'] : null;
    const replacing = !existing || setupMode.get(key) === 'replace';
    p[sk + 'Profile'] = profileRecord(profile);
    if (!replacing && needsReview(compareDelivery(existing, incoming)).length) {
      saveProject(p);
      setupPending.set(key, { incoming, origin: 'profile', file: profile.system });
      toast('Some tables are already in the list with differences. Choose which version to keep.');
      renderSetup({ id });
      return;
    }
    if (!replacing && !p[sk + 'Origin']) p[sk + 'Origin'] = listOrigin(p, side);
    const res = applyAndRecord(p, side, incoming, 'profile', profile.system, new Set(), replacing);
    recordOrigin(p, side, 'profile', replacing ? 'replace' : 'add');
    saveProject(p);
    setupMode.delete(key);
    toast(replacing ? `Added the ready field list: ${profileFieldCount(profile)} fields.` : `Added: ${deliverySummaryText(res.record)}.`);
    renderSetup({ id });
  }));
  document.querySelectorAll('.setup-pending-apply').forEach(b => b.addEventListener('click', () => {
    const side = b.dataset.side;
    const key = `${id}:${side}`;
    const pending = setupPending.get(key);
    if (!pending) return;
    const p = getProject(id);
    const res = applyAndRecord(p, side, pending.incoming, pending.origin, pending.file, readUseNew(document.getElementById(`setup-pending-${side}`)), false);
    recordOrigin(p, side, pending.origin, 'add');
    saveProject(p);
    setupPending.delete(key); setupMode.delete(key);
    toast(`Added: ${deliverySummaryText(res.record)}.`);
    renderSetup({ id });
  }));
  document.querySelectorAll('.setup-pending-cancel').forEach(b => b.addEventListener('click', () => {
    setupPending.delete(`${id}:${b.dataset.side}`); renderSetup({ id });
  }));
  document.getElementById('expected-save')?.addEventListener('click', () => {
    const p = getProject(id);
    p.expectedTables = [
      ...parseExpected(document.getElementById('expected-old').value, 'old'),
      ...parseExpected(document.getElementById('expected-new').value, 'new'),
    ];
    saveProject(p);
    toast('Saved the tables still to come');
    renderSetup({ id });
  });
  const setMode = (side, value) => { if (value) setupMode.set(`${id}:${side}`, value); else setupMode.delete(`${id}:${side}`); renderSetup({ id }); };
  document.querySelectorAll('.setup-add').forEach(b => b.addEventListener('click', () => setMode(b.dataset.side, 'add')));
  document.querySelectorAll('.setup-replace').forEach(b => b.addEventListener('click', () => setMode(b.dataset.side, 'replace-confirm')));
  document.querySelectorAll('.setup-replace-yes').forEach(b => b.addEventListener('click', () => setMode(b.dataset.side, 'replace')));
  document.querySelectorAll('.setup-cancel').forEach(b => b.addEventListener('click', () => setMode(b.dataset.side, null)));
  document.querySelectorAll('.setup-remove-orphans').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to remove them'; return; }
    const p = getProject(id);
    const goneList = orphanMatches(p, b.dataset.side);
    const gone = new Set(goneList.map(m => m.id));
    const who = getCurrentUser()?.name || 'unknown';
    goneList.forEach(m => retireMatch(p, m, { by: who, reason: RECORD_TEXT.droppedFromList, kind: 'dropped' }));
    p.mappings = p.mappings.filter(m => !gone.has(m.id));
    saveProject(p);
    toast(`Removed ${gone.size} ${gone.size === 1 ? 'match' : 'matches'}`);
    renderSetup({ id });
  }));
  const sample = (side, schema, name) => document.getElementById(`load-${side}-sample`)?.addEventListener('click', () => {
    const p = getProject(id);
    applyAndRecord(p, side === 'source' ? 'old' : 'new', cloneSample(schema), 'sample', `${name} sample`, new Set(), true);
    recordOrigin(p, side === 'source' ? 'old' : 'new', 'sample', 'replace');
    saveProject(p);
    setupMode.delete(`${id}:${side === 'source' ? 'old' : 'new'}`);
    toast(`${name} sample loaded`);
    renderSetup({ id });
  });
  sample('source', synergySample, 'Synergy');
  sample('target', impulseSample, 'Impulse');
}

// Below the two lists: what has come in so far, and what is still to come.
function setupExtras(project, esc) {
  const log = [...(project.deliveries || [])].reverse();
  const expected = project.expectedTables || [];
  const waiting = stillExpected(project);
  const waitingKeys = new Set(waiting.map(e => `${e.side}:${e.name}`));
  const side = s => s === 'old' ? 'Old system' : 'New system';
  const from = { db: 'Database', file: 'File', screens: 'Pictures of screens', supplier: "Supplier's spreadsheet", sample: 'Sample', profile: 'Ready field list' };
  const when = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lines = s => expected.filter(e => e.side === s).map(e => e.name).join('\n');
  return `
    <details class="card setup-extra" id="setup-expected" ${waiting.length ? 'open' : ''}>
      <summary><strong>${esc(DELIVERY_TEXT.expectTitle)}</strong>
        <span class="recon-sub" style="display:inline"> ${waiting.length ? esc(DELIVERY_TEXT.waiting(waiting.length)) : expected.length ? 'Everything you were waiting for has arrived.' : 'Note any tables the supplier has not sent yet.'}</span></summary>
      <p class="recon-sub" style="margin:0.6rem 0">${esc(DELIVERY_TEXT.expectLead)}</p>
      ${expected.length ? `<ul class="expected-list">${expected.map(e => `<li class="${waitingKeys.has(`${e.side}:${e.name}`) ? 'is-waiting' : 'is-in'}">${waitingKeys.has(`${e.side}:${e.name}`) ? '○' : '✓'} ${esc(side(e.side))}: ${esc(e.name)}${waitingKeys.has(`${e.side}:${e.name}`) ? '' : ' (arrived)'}</li>`).join('')}</ul>` : ''}
      <div class="grid-2" style="gap:1rem">
        <label class="field"><span>Old system</span><textarea id="expected-old" rows="3" placeholder="One table per line">${esc(lines('old'))}</textarea></label>
        <label class="field"><span>New system</span><textarea id="expected-new" rows="3" placeholder="One table per line">${esc(lines('new'))}</textarea></label>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="expected-save">Save</button>
    </details>
    ${log.length ? `
    <details class="card setup-extra" id="setup-log">
      <summary><strong>${esc(DELIVERY_TEXT.logTitle)}</strong> <span class="recon-sub" style="display:inline"> ${log.length} ${log.length === 1 ? 'delivery' : 'deliveries'}, the latest ${esc(when(log[0].at))}</span></summary>
      <p class="recon-sub" style="margin:0.6rem 0">${esc(DELIVERY_TEXT.logLead)}</p>
      <div class="schema-preview"><table>
        <thead><tr><th>When</th><th>System</th><th>From</th><th>File</th><th>What came in</th></tr></thead>
        <tbody>${log.map(d => `<tr><td>${esc(when(d.at))}</td><td>${esc(side(d.side))}</td><td>${esc(from[d.origin] || d.origin)}</td><td>${esc(d.file || '—')}</td><td>${d.replaced ? 'Replaced the list. ' : ''}${esc(deliverySummaryText(d))}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : ''}`;
}

function setupUpload(side, projectId) {
  const zone = document.getElementById(`${side}-upload`);
  const input = document.getElementById(`${side}-file`);
  const origin = zone.dataset.origin || 'file';
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleSchemaFile(e.dataTransfer.files[0], side, projectId, origin);
  });
  input.addEventListener('change', e => {
    if (e.target.files[0]) handleSchemaFile(e.target.files[0], side, projectId, origin);
  });
}

async function handleSchemaFile(file, side, projectId, origin = 'file') {
  try {
    const text = await readFileAsText(file);
    const schema = file.name.endsWith('.csv')
      ? parseCSVTemplate(text, file.name.replace('.csv', ''))
      : parseJSONSchema(text);
    if (origin === 'db' && (!schema.tables || !schema.tables.length)) {
      throw new Error('This does not look like a connector file. It should list tables and their fields.');
    }
    const p = getProject(projectId);
    const key = side === 'source' ? 'sourceSchema' : 'targetSchema';
    const sideWord = side === 'source' ? 'old' : 'new';
    const modeKey = `${projectId}:${sideWord}`;
    const warnings = schema._warnings;
    delete schema._warnings;
    let message;
    const existing = p[key]?.tables?.length ? p[key] : null;
    const replacing = !existing || setupMode.get(modeKey) === 'replace';
    if (!replacing && needsReview(compareDelivery(existing, schema)).length) {
      // Some tables came in again with changes: let the person choose before anything changes.
      setupPending.set(modeKey, { incoming: schema, origin, file: file.name });
      toast('Some tables came in again with changes. Choose which version to keep.');
      renderSetup({ id: projectId });
      document.getElementById(`setup-side-${sideWord}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (!replacing && !p[side + 'Origin']) p[side + 'Origin'] = listOrigin(p, sideWord);
    const res = applyAndRecord(p, sideWord, schema, origin, file.name, new Set(), replacing);
    recordOrigin(p, sideWord, origin, replacing ? 'replace' : 'add');
    if (replacing) {
      const orphans = orphanMatches(p, sideWord).length;
      message = existing
        ? (orphans ? `List replaced. ${orphans} ${orphans === 1 ? 'match uses a field' : 'matches use fields'} not in the new list.` : 'List replaced.')
        : 'Field list added';
    } else {
      message = `Added: ${deliverySummaryText(res.record)}.`;
    }
    saveProject(p);
    setupMode.delete(modeKey);
    toast(warnings?.length ? `${message} Warning: ${warnings[0]}` : message);
    renderSetup({ id: projectId });
  } catch (err) {
    toast(err.message);
  }
}

function renderSchemaExamples() {
  return `
    <details class="card schema-examples-card">
      <summary class="schema-examples-summary">
        <span class="schema-examples-title">Field list examples</span>
        <span class="schema-examples-meta">How to write down what each field means and the values it holds</span>
      </summary>
      <div class="schema-examples-body">
        <p class="schema-examples-lede">Each field can have a plain-English <strong>definition</strong> and a <strong>values</strong> note. MapBridge shows these on both sides when you match fields, and warns when the values are written differently. For example, one system says <code>1/0</code> and the other expects <code>Y/N</code>.</p>
        <div class="schema-examples-grid">
          <div class="schema-example-block">
            <h4>JSON example</h4>
            <pre class="schema-example-code">{
  "system": "Synergy",
  "tables": [{
    "name": "mig_pupil",
    "columns": [{
      "name": "fsm_flag",
      "type": "char(1)",
      "required": false,
      "description": "Free school meals eligibility at extract date",
      "values": "1 = eligible, 0 = not eligible"
    }]
  }]
}</pre>
            <div class="schema-example-downloads">
              <a href="samples/synergy-schema.json" download class="btn btn-ghost btn-sm">Full Synergy JSON</a>
              <a href="samples/impulse-schema.json" download class="btn btn-ghost btn-sm">Full Impulse JSON</a>
            </div>
          </div>
          <div class="schema-example-block">
            <h4>CSV example</h4>
            <p class="schema-example-hint">Row 1: names · Row 2: types · Row 3: definitions · Row 4: values — same as the Load sample buttons</p>
            <pre class="schema-example-code">pupil_id,forename,fsm_flag
int,varchar(50),char(1)
Internal pupil ID,Pupil given name,FSM eligibility flag
Numeric ID,Free text,"1 = eligible, 0 = not eligible"</pre>
            <div class="schema-example-downloads">
              <a href="samples/synergy-pupil-extract.csv" download class="btn btn-ghost btn-sm">Old system CSV</a>
              <a href="samples/impulse-pupil-template.csv" download class="btn btn-ghost btn-sm">New system CSV</a>
            </div>
          </div>
        </div>
        <div class="schema-example-pairs">
          <h4>Side-by-side: document both formats</h4>
          <table class="schema-pairs-table">
            <thead><tr><th>Field</th><th>Old system</th><th>New system</th><th>Why it matters</th></tr></thead>
            <tbody>
              <tr>
                <td><code>fsm_flag</code> → <code>FSM_STATUS</code></td>
                <td><span class="value-chip">1 = eligible, 0 = not eligible</span></td>
                <td><span class="value-chip">Y = eligible, N = not eligible</span></td>
                <td>Needs a rule to turn one into the other. MapBridge warns you when you match them</td>
              </tr>
              <tr>
                <td><code>relationship</code> → <code>REL_CODE</code></td>
                <td><span class="value-chip">Synergy lookup code</span></td>
                <td><span class="value-chip">Impulse code list required</span></td>
                <td>Vendor must supply their code list</td>
              </tr>
              <tr>
                <td><code>pupil_id</code> → <code>PUPIL_REF</code></td>
                <td><span class="value-chip">Numeric ID</span></td>
                <td><span class="value-chip">Vendor-assigned pupil key</span></td>
                <td>ID strategy must be agreed upfront</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>`;
}

function renderSchemaPreview(schema, stats) {
  const PREVIEW_ROWS = 8;
  const rows = schema.tables.flatMap(t => t.columns.map(c => ({ t, c })));
  const fromShots = rows.some(r => r.c.origin === 'screenshot');
  return `
    <div class="alert alert-success" style="margin-top:0.75rem">${stats.tables} ${stats.tables === 1 ? 'table' : 'tables'} · ${stats.columns} ${stats.columns === 1 ? 'field' : 'fields'} loaded</div>
    ${fromShots ? '<p class="recon-sub" style="margin:0 0 0.5rem">Some names came from screenshots. They are the words shown on a screen, not the real names of the fields.</p>' : ''}
    <div class="schema-preview"><table>
      <thead><tr><th>Table</th><th>Field</th><th>Type</th><th>Definition</th><th>Values</th></tr></thead>
      <tbody>${rows.slice(0, PREVIEW_ROWS).map(({ t, c }) =>
        `<tr><td>${esc(t.name)}</td><td>${esc(c.name)}</td><td>${esc(c.type)}</td><td>${c.origin === 'screenshot'
          ? `<span class="shot-tag" title="${esc(c.description || '')}">Label from a screenshot</span>` : esc(c.description || '—')}</td><td>${esc(c.values || '—')}</td></tr>`
      ).join('')}${rows.length > PREVIEW_ROWS ? `<tr><td colspan="5" style="color:var(--muted);font-size:0.82rem">… and ${rows.length - PREVIEW_ROWS} more fields</td></tr>` : ''}
      </tbody></table></div>`;
}

function renderColumnDefinitionCard(label, col, sideClass) {
  if (!col) {
    return `<div class="col-def-card ${sideClass}"><div class="col-def-label">${esc(label)}</div><p class="col-def-empty">This field is not in the field list</p></div>`;
  }
  return `
    <div class="col-def-card ${sideClass}">
      <div class="col-def-label">${esc(label)}</div>
      <div class="col-def-name">${esc(col.name)} <span class="col-type">${esc(col.type)}</span></div>
      <p class="col-def-text">${col.description ? esc(col.description) : '<span class="col-def-missing">No definition yet. Ask the supplier what this field means.</span>'}</p>
      <div class="col-def-values">${col.values
        ? `<span class="value-chip">${esc(col.values)}</span>`
        : '<span class="col-def-missing">Values not documented</span>'}</div>
    </div>`;
}

function renderInvite({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();
  const users = getUsers();

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  mount(`
    ${projectSteps(project, 'invite')}
    <div class="page-head"><div><h1>Team</h1><p>Invite the people working on this move. They join this project only.</p></div></div>
    <div class="grid-2">
      <div class="card">
        <form id="invite-form">
          <div class="field"><label>Email address</label><input type="email" name="email" placeholder="colleague@authority.gov.uk" required></div>
          <div class="field"><label>Role</label>
            <select name="role">
              <option value="editor">Editor — can match fields</option>
              <option value="viewer">Viewer — read and comment only</option>
            </select>
          </div>
          <button class="btn btn-primary" type="submit">Send invite</button>
        </form>
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Project members</h3>
        <ul class="invite-list">${project.members.map(m => {
          const u = users.find(x => x.id === m.userId);
          return `<li><span>${esc(u?.name || 'Unknown')} · ${m.role}</span><span class="status-pill status-active">${m.status}</span></li>`;
        }).join('')}</ul>
        <div id="pending-invites"></div>
      </div>
    </div>
    <div style="margin-top:1.25rem">
      <a href="#/projects/${id}/map" class="btn btn-secondary">Continue to matching →</a>
    </div>
  `);
  attachLogout();

  const pending = getInvites().filter(i => i.projectId === id);
  if (pending.length) {
    document.getElementById('pending-invites').innerHTML = `
      <h4 style="margin:1rem 0 0.5rem;font-size:0.85rem;color:var(--muted)">Pending invites</h4>
      <ul class="invite-list">${pending.map(i => `
        <li><span>${esc(i.email)}</span>
          <button class="btn btn-ghost btn-sm copy-link" data-link="${location.origin}${location.pathname}#/invite/${i.token}">Copy link</button>
        </li>`).join('')}</ul>`;
    document.querySelectorAll('.copy-link').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.link);
        toast('Invite link copied');
      });
    });
  }

  document.getElementById('invite-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const token = uid();
    saveInvite({
      token,
      projectId: id,
      email: fd.get('email'),
      role: fd.get('role'),
      createdAt: new Date().toISOString(),
    });
    toast('Invite created — copy the link');
    renderInvite({ id });
  });
}

function renderAcceptInvite({ token }) {
  const invite = getInviteByToken(token);
  const user = getCurrentUser();

  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';

  if (!invite) {
    mount(`<div class="card"><h2>Invalid invite</h2><p>This invite link has expired or doesn't exist.</p></div>`);
    return;
  }

  const project = getProject(invite.projectId);
  mount(`
    <div class="card" style="max-width:480px;margin:2rem auto">
      <h2>You're invited</h2>
      <p style="color:var(--muted);margin:0.5rem 0 1rem">Join <strong>${esc(project.name)}</strong> as ${invite.role}.</p>
      ${user ? `
        <button class="btn btn-primary" id="accept-invite">Accept invite</button>
      ` : `
        <p style="font-size:0.88rem;margin-bottom:1rem">Sign in or create an account to accept.</p>
        <a href="#/login" class="btn btn-primary">Sign in</a>
      `}
    </div>
  `);

  document.getElementById('accept-invite')?.addEventListener('click', () => {
    addMember(invite.projectId, getCurrentUser().id, invite.role);
    removeInvite(token);
    toast('Joined project');
    location.hash = `#/projects/${invite.projectId}/map`;
  });
}

// Projects where the Match screen shows only the tables from the latest delivery.
const mapOnlyNew = new Set();

function mapNewBar(project) {
  const t = recentTables(project, 'new');
  const o = recentTables(project, 'old');
  const side = t.size ? 'new' : o.size ? 'old' : null;
  if (!side) return '';
  const n = (side === 'new' ? t : o).size;
  return `
    <div class="map-new-bar">
      <span><b class="table-new-badge">New</b> ${n} ${side} system ${n === 1 ? 'table' : 'tables'} arrived or changed in the latest delivery.</span>
      <label><input type="checkbox" id="map-only-new" ${mapOnlyNew.has(project.id) ? 'checked' : ''}> Show only ${n === 1 ? 'that table' : 'those tables'} on the ${side} system side</label>
    </div>`;
}

function renderMap({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();

  if (!project.sourceSchema || !project.targetSchema) {
    location.hash = `#/projects/${id}/setup`;
    return;
  }

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main" style="max-width:none;width:calc(100% - 2rem)"></main>';

  mount(`
    ${projectSteps(project, 'map')}
    <div class="page-head">
      <div><h1>Match fields</h1><p>Drag from a dot on the ${esc(oldName(project))} side to a dot on the ${esc(newName(project))} side. Each side shows what the field means. MapBridge warns you when the values are written differently, like 1/0 and Y/N.</p></div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-primary btn-sm" id="ai-suggest">Suggest matches</button>
        <button class="btn btn-ghost btn-sm" id="ai-settings">AI settings</button>
        <a href="#/projects/${id}/export" class="btn btn-ghost btn-sm">Downloads</a>
      </div>
    </div>
    ${mapNewBar(project)}
    <div id="mapping-container"></div>
    <section class="card decisions-panel" id="decisions-panel" aria-labelledby="decisions-title"></section>
  `);
  attachLogout();
  document.getElementById('map-only-new')?.addEventListener('change', e => {
    if (e.target.checked) mapOnlyNew.add(id); else mapOnlyNew.delete(id);
    renderMap({ id });
  });

  const fresh = { source: recentTables(project, 'old'), target: recentTables(project, 'new') };
  const container = document.getElementById('mapping-container');
  canvasInstance = new MappingCanvas(container, {
    sourceSchema: project.sourceSchema,
    targetSchema: project.targetSchema,
    oldLabel: systemTag('old', esc) + esc(project.sourceSystem || ''),
    newLabel: systemTag('new', esc) + esc(project.targetSystem || ''),
    mappings: [...project.mappings],
    newTables: fresh,
    onlyNewSide: mapOnlyNew.has(id) ? (fresh.target.size ? 'target' : 'source') : null,
    getActor: () => getCurrentUser()?.name || 'unknown',
    onChange: mappings => {
      const p = getProject(id);
      retireMissing(p, p.mappings, mappings, { by: getCurrentUser()?.name || 'unknown' });
      p.mappings = mappings;
      p.status = 'mapping';
      saveProject(p);
      const stats = mappingProgress(p.sourceSchema, p.targetSchema, mappings);
      canvasInstance.updateFooter(stats);
      renderDecisions(id);
    },
    onSelectMapping: mapping => openMappingDrawer(mapping, id),
  });
  renderDecisions(id);

  const stats = mappingProgress(project.sourceSchema, project.targetSchema, project.mappings);
  project.mappings.forEach(ensureVerification);
  saveProject(project);
  canvasInstance.updateFooter(stats);

  document.getElementById('ai-settings').addEventListener('click', () => {
    openAISettingsModal();
  });

  document.getElementById('ai-suggest').addEventListener('click', async () => {
    await openAISuggestModal(id);
  });
}

// Old fields with no match: record "not moving" with a reason, so the
// evidence shows what was left behind and why. Decisions are never erased.
const decisionOpen = new Set();
function renderDecisions(id) {
  const panel = document.getElementById('decisions-panel');
  if (!panel) return;
  const project = getProject(id);
  const list = unmatchedOldFields(project);
  const sum = decisionSummary(project);
  const day = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  panel.innerHTML = `
    <h2 id="decisions-title">${esc(RECORD_TEXT.notMovingTitle)} <span class="recon-sub">${sum.unmatched ? `${sum.decided} of ${sum.unmatched} decided` : ''}</span></h2>
    ${!list.length ? `<p class="recon-sub">${esc(RECORD_TEXT.allDecided)}</p>` : `
    <p class="recon-sub">${esc(RECORD_TEXT.notMovingLead)}</p>
    <ul class="decision-list">${list.map(f => {
      const k = `${f.table}.${f.column}`;
      if (f.decision) {
        return `<li class="decision-row decided">
          <span class="decision-field">${esc(k)}</span>
          <span class="decision-state"><strong>${esc(RECORD_TEXT.notMoving)}:</strong> ${esc(f.decision.reason)} <span class="recon-sub">${esc(f.decision.by)}, ${esc(day(f.decision.at))}</span></span>
          <button type="button" class="btn btn-ghost btn-sm decision-undo" data-table="${esc(f.table)}" data-column="${esc(f.column)}">${esc(RECORD_TEXT.undo)}</button>
        </li>`;
      }
      if (decisionOpen.has(k)) {
        return `<li class="decision-row">
          <span class="decision-field">${esc(k)}</span>
          <form class="decision-form" data-table="${esc(f.table)}" data-column="${esc(f.column)}">
            <label for="dec-${esc(k)}">${esc(RECORD_TEXT.notMovingReason)}</label>
            <p class="decision-error" hidden>${esc(RECORD_TEXT.reasonNeeded)}</p>
            <input id="dec-${esc(k)}" name="reason" type="text" autocomplete="off">
            <span class="decision-actions"><button type="submit" class="btn btn-primary btn-sm">${esc(RECORD_TEXT.notMovingSave)}</button>
            <button type="button" class="btn btn-ghost btn-sm decision-cancel" data-key="${esc(k)}">Cancel</button></span>
          </form>
        </li>`;
      }
      return `<li class="decision-row">
        <span class="decision-field">${esc(k)}</span>
        <span class="decision-state recon-sub">${esc(RECORD_TEXT.undecided)}</span>
        <button type="button" class="btn btn-secondary btn-sm decision-open" data-key="${esc(k)}">${esc(RECORD_TEXT.notMoving)}</button>
      </li>`;
    }).join('')}</ul>`}`;
  const who = () => getCurrentUser()?.name || 'unknown';
  panel.querySelectorAll('.decision-open').forEach(b => b.addEventListener('click', () => {
    decisionOpen.add(b.dataset.key); renderDecisions(id);
    panel.querySelector(`.decision-form input`)?.focus();
  }));
  panel.querySelectorAll('.decision-cancel').forEach(b => b.addEventListener('click', () => { decisionOpen.delete(b.dataset.key); renderDecisions(id); }));
  panel.querySelectorAll('.decision-form').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const reason = String(new FormData(f).get('reason') || '').trim();
    if (!reason) { f.querySelector('.decision-error').hidden = false; f.querySelector('input').focus(); return; }
    const p = getProject(id);
    recordNotMoving(p, { table: f.dataset.table, column: f.dataset.column, reason, by: who() });
    saveProject(p);
    decisionOpen.delete(`${f.dataset.table}.${f.dataset.column}`);
    toast('Decision recorded');
    renderDecisions(id);
  }));
  panel.querySelectorAll('.decision-undo').forEach(b => b.addEventListener('click', () => {
    const p = getProject(id);
    withdrawDecision(p, { table: b.dataset.table, column: b.dataset.column, by: who() });
    saveProject(p);
    toast(RECORD_TEXT.undone);
    renderDecisions(id);
  }));
}

function formatStepNames(t) {
  if (!t?.names?.length) return t?.by || '';
  return t.names.join(', ');
}

// Asks "Did it pass?" with two clear answers. A fail needs a note, which
// shows only when "No" is picked.
function showPassModal({ step, mapping }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'record-modal-backdrop';
    backdrop.innerHTML = `
      <div class="record-modal" role="dialog" aria-modal="true" aria-labelledby="pass-title">
        <h3 id="pass-title">${esc(step.action)}</h3>
        <p class="record-modal-sub">${fieldPairHtml(mapping, esc)}</p>
        ${passQuestionHtml(esc)}
        <div class="record-modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="pass-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="pass-continue">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const modal = backdrop.querySelector('.record-modal');
    const reveal = backdrop.querySelector('#pass-fail-reveal');
    const close = result => { backdrop.remove(); resolve(result); };
    backdrop.querySelectorAll('input[name="pass"]').forEach(r => r.addEventListener('change', () => {
      reveal.hidden = r.value !== 'no' || !r.checked;
      if (!reveal.hidden) backdrop.querySelector('#pass-note').focus();
    }));
    backdrop.querySelector('#pass-cancel').onclick = () => close(null);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('#pass-continue').onclick = () => {
      const choice = backdrop.querySelector('input[name="pass"]:checked')?.value;
      const answer = readPassAnswer(choice, backdrop.querySelector('#pass-note').value);
      if (showErrors(modal, answer.errors)) return;
      close({ pass: answer.pass, note: answer.note, reference: answer.pass ? '' : backdrop.querySelector('#pass-ref').value.trim() });
    };
    backdrop.querySelector('input[name="pass"]').focus();
  });
}

function showParticipantModal({ step, teamNames, defaultName, multi }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'record-modal-backdrop';
    const names = [...new Set([defaultName, ...teamNames].filter(Boolean))];
    const selected = new Set(multi ? [defaultName].filter(Boolean) : [defaultName || names[0] || '']);

    backdrop.innerHTML = `
      <div class="record-modal" role="dialog" aria-modal="true" aria-labelledby="participant-title">
        <h3 id="participant-title">${multi ? 'Who checked?' : 'Recorded by'}</h3>
        <p class="record-modal-sub">${esc(step.action)}${multi ? ' — select everyone who checked' : ''}</p>
        <div class="record-modal-list">${names.length ? names.map(name => `
          <label class="record-modal-option">
            <input type="${multi ? 'checkbox' : 'radio'}" name="participant" value="${esc(name)}"
              ${selected.has(name) ? 'checked' : ''}${!multi ? '' : ''}>
            <span>${esc(name)}</span>
          </label>`).join('') : '<p class="record-modal-empty">Add names to the migration team below first.</p>'}
        <div class="field" style="margin:0.75rem 0 0">
          <label for="participant-custom">${multi ? 'Add someone not listed' : 'Or type a name'}</label>
          <input id="participant-custom" placeholder="Full name">
        </div>
        <div class="record-modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="participant-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="participant-confirm">Record</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);

    function close(result) {
      backdrop.remove();
      resolve(result);
    }

    backdrop.querySelector('#participant-cancel').onclick = () => close(null);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null); });

    backdrop.querySelector('#participant-confirm').onclick = () => {
      const custom = backdrop.querySelector('#participant-custom').value.trim();
      let picked;
      if (multi) {
        picked = [...backdrop.querySelectorAll('input[name="participant"]:checked')].map(el => el.value);
        if (custom && !picked.includes(custom)) picked.push(custom);
      } else {
        picked = custom ? [custom] : [...backdrop.querySelectorAll('input[name="participant"]:checked')].map(el => el.value).slice(0, 1);
      }
      if (!picked.length) {
        showErrors(backdrop.querySelector('.record-modal'), [{ id: 'participant-custom', text: GOVUK_TEXT.pickName }]);
        return;
      }
      close(picked);
    };
  });
}

function renderServiceAreaOptions(areas, selected = '') {
  return `<option value="">—</option>${areas.map(a =>
    `<option value="${esc(a)}" ${selected === a ? 'selected' : ''}>${esc(a)}</option>`
  ).join('')}`;
}

function bindServiceAreaSelects(projectId, rerender) {
  document.querySelectorAll('.service-area-select').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const p = getProject(projectId);
      const m = p.mappings.find(x => x.id === sel.dataset.mappingId);
      if (!m) return;
      m.serviceArea = sel.value;
      saveProject(p);
      if (canvasInstance) {
        const cm = canvasInstance.mappings.find(x => x.id === m.id);
        if (cm) cm.serviceArea = sel.value;
      }
      rerender?.();
    });
  });
}

function renderVerify({ id }) {
  if (!getProject(id)) return renderNotFound();
  const initial = getProject(id);
  if (!initial.mappings?.length) {
    location.hash = `#/projects/${id}/map`;
    return;
  }
  initial.mappings.forEach(m => ensureMappingFields(m));
  ensureProjectServiceAreas(initial);
  ensureProjectTeam(initial);
  saveProject(initial);

  let filterStep = null;
  let filterPhase = null;
  let filterStatus = null;
  let filterServiceArea = null;
  let filterQuick = null;
  let searchQuery = '';
  let dashboardOpen = false;
  let setupOpen = false;

  document.getElementById('app-shell').innerHTML = nav(initial.name) + '<main class="app-main" id="app-main"></main>';

  function render() {
    const panel = document.getElementById('trace-dashboard-panel');
    if (panel?.open) dashboardOpen = true;
    const setupPanel = document.getElementById('project-setup-panel');
    if (setupPanel?.open) setupOpen = true;

    const project = getProject(id);
    ensureProjectTeam(project);
    ensureProjectServiceAreas(project);
    project.mappings.forEach(ensureMappingFields);
    const traceCounts = traceStepSummary(project.mappings);
    const areaCounts = countByServiceArea(project.mappings);
    const serviceAreas = getProjectServiceAreaNames(project);
    let filtered = filterMappings(project.mappings, {
      traceStep: filterStep,
      phase: filterPhase,
      status: filterStatus,
      serviceArea: filterServiceArea,
    });
    const checks = fieldCheckIndex(project, project.reconRuns || [], { finalRunId: project.reconFinalRunId || null });
    // The file comparison column only appears once someone has compared files.
    const hasFileChecks = (project.reconRuns || []).length > 0;
    const conflicts = trackerConflicts(project, checks);
    const conflictIds = new Set(conflicts.map(m => m.id));
    const failingCount = project.mappings.filter(m => checks.get(m.id)?.state === 'fail').length;
    if (filterQuick === 'failing') {
      filtered = filtered.filter(m => checks.get(m.id)?.state === 'fail');
    } else if (filterQuick === 'conflict') {
      filtered = filtered.filter(m => conflictIds.has(m.id));
    } else if (filterQuick === 'active') {
      filtered = filtered.filter(m => m.verification?.status !== 'signed_off');
    } else if (filterQuick === 'issues') {
      filtered = filtered.filter(m => ['test_failed', 'live_failed'].includes(m.verification?.status));
    } else if (filterQuick === 'done') {
      filtered = filtered.filter(m => m.verification?.status === 'signed_off');
    }
    const quickCounts = {
      active: project.mappings.filter(m => m.verification?.status !== 'signed_off').length,
      issues: project.mappings.filter(m => ['test_failed', 'live_failed'].includes(m.verification?.status)).length,
      done: project.mappings.filter(m => m.verification?.status === 'signed_off').length,
    };
    const dashData = buildTraceDashboardData(project.mappings);

    destroyDashboardCharts();
    mount(`
      ${projectSteps(project, 'verify')}
      <div class="page-head verify-page-head">
        <div>
          <h1>Field tracker</h1>
          <p class="verify-lede">The steps are: matched, sent for loading, loaded into test, passed in test, loaded into live, passed in live, signed off. Select <strong>+</strong> on a row to record the next step.</p>
        </div>
        <a href="#/projects/${id}/reconcile" class="btn btn-secondary btn-sm">Compare files (optional) →</a>
      </div>
      ${conflicts.length ? `
        <div class="recon-error tracker-conflict" role="alert">
          <span><strong>${conflicts.length} ${conflicts.length === 1 ? 'field is' : 'fields are'} marked as passed, but the latest file comparison found differences.</strong>
          Either the fix has not been re-checked yet, or the field was passed too early.</span>
          <button class="btn btn-secondary btn-sm" id="show-conflicts">Show ${conflicts.length === 1 ? 'it' : 'them'}</button>
        </div>` : ''}
      <section class="card field-find" aria-labelledby="field-find-title">
        <h2 id="field-find-title">${esc(RECORD_TEXT.searchTitle)}</h2>
        <label for="field-find-input">${esc(RECORD_TEXT.searchLabel)}</label>
        <p class="route-hint" id="field-find-hint">${esc(RECORD_TEXT.searchHint)}</p>
        <input type="search" id="field-find-input" aria-describedby="field-find-hint" autocomplete="off" value="${esc(searchQuery)}">
        <div id="field-find-results" aria-live="polite"></div>
      </section>
      ${renderTraceDashboardHTML(dashData, dashboardOpen)}
      <p class="recon-sub" style="margin:0 0 1rem">The people who record steps, and the areas with their managers, are in <a href="#/projects/${id}/settings">Project settings</a>.</p>
      <div class="verify-workspace card">
        <div class="verify-toolbar">
          <div class="verify-toolbar-block">
            <span class="verify-toolbar-label">Filter by step</span>
            ${renderPhaseBar(traceCounts, filterStep)}
          </div>
          <div class="verify-toolbar-row">
            <div class="verify-toolbar-block verify-toolbar-areas">
              <span class="verify-toolbar-label">Area</span>
              <div class="verify-filter-pills" id="verify-area-filters">
                <button class="verification-pill ${!filterServiceArea ? 'active' : ''}" data-filter-type="area-all">All</button>
                ${serviceAreas.map(area => areaCounts[area] ? `
                  <button class="verification-pill ${filterServiceArea === area ? 'active' : ''}" data-filter-type="service-area" data-filter="${esc(area)}">
                    ${esc(area)} <span class="count">${areaCounts[area]}</span>
                  </button>` : '').join('')}
                ${areaCounts.__unassigned__ ? `
                  <button class="verification-pill ${filterServiceArea === '__unassigned__' ? 'active' : ''}" data-filter-type="service-area" data-filter="__unassigned__">
                    Unassigned <span class="count">${areaCounts.__unassigned__}</span>
                  </button>` : ''}
              </div>
            </div>
            <div class="verify-toolbar-block verify-toolbar-show">
              <span class="verify-toolbar-label">Show</span>
              <div class="verify-filter-pills" id="verify-quick-filters">
                <button class="verification-pill ${!filterQuick && !filterStep ? 'active' : ''}" data-filter-type="all">All <span class="count">${project.mappings.length}</span></button>
                <button class="verification-pill ${filterQuick === 'active' ? 'active' : ''}" data-filter-type="quick" data-filter="active">In progress <span class="count">${quickCounts.active}</span></button>
                <button class="verification-pill verify-pill-warn ${filterQuick === 'issues' ? 'active' : ''}" data-filter-type="quick" data-filter="issues"${quickCounts.issues ? '' : ' disabled'}>Issues <span class="count">${quickCounts.issues}</span></button>
                <button class="verification-pill ${filterQuick === 'done' ? 'active' : ''}" data-filter-type="quick" data-filter="done">Signed off <span class="count">${quickCounts.done}</span></button>
                ${hasFileChecks ? `<button class="verification-pill verify-pill-warn ${filterQuick === 'failing' || filterQuick === 'conflict' ? 'active' : ''}" data-filter-type="quick" data-filter="failing"${failingCount ? '' : ' disabled'}>Differences in files <span class="count">${failingCount}</span></button>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="verify-table-wrap">
          ${filtered.length ? `<table class="verification-table${hasFileChecks ? '' : ' no-file-checks'}">
            <thead><tr>
              <th>Field</th>
              <th>Status</th>
              ${hasFileChecks ? '<th>File comparison</th>' : ''}
              <th>Progress</th>
              <th class="col-service-area">Area</th>
            </tr></thead>
            <tbody>${filtered.map(m => {
            const phase = statusMeta(m.verification.status).phase;
            const status = m.verification.status;
            const current = statusMeta(status);
            const rowClass = [
              phase === 'live' ? 'row-live' : '',
              status === 'live_failed' ? 'row-live-failed' : '',
              status === 'signed_off' ? 'row-done' : '',
              conflictIds.has(m.id) ? 'row-conflict' : '',
            ].filter(Boolean).join(' ');
            return `<tr${rowClass ? ` class="${rowClass}"` : ''} data-mapping-id="${m.id}">
              <td class="col-mapping">${fieldPairHtml(m, esc)}</td>
              <td class="col-status"><span class="status-badge" style="background:${current.color}18;color:${current.color}">${current.label}</span></td>
              ${hasFileChecks ? `<td class="col-check">${renderCheckCell(id, checks.get(m.id), conflictIds.has(m.id))}</td>` : ''}
              <td class="col-trace">${renderTraceStrip(m, { interactive: true, mappingId: m.id, compact: true })}</td>
              <td class="col-service-area">
                <select class="service-area-select" data-mapping-id="${m.id}" aria-label="Service area">
                  ${renderServiceAreaOptions(serviceAreas, m.serviceArea || '')}
                </select>
              </td>
            </tr>`;
          }).join('')}</tbody>
          </table>` : `<div class="empty-state verify-empty">
            <p>No fields match this filter.</p>
            <p class="verify-empty-hint">Try clearing the filters, or select <strong>+</strong> on a row to record the next step.</p>
          </div>`}
        </div>
      </div>
    `);

    document.querySelectorAll('#verify-area-filters .verification-pill, #verify-quick-filters .verification-pill').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener('click', () => {
        if (btn.dataset.filterType === 'area-all') {
          filterServiceArea = null;
        } else if (btn.dataset.filterType === 'service-area') {
          filterServiceArea = btn.dataset.filter;
          filterStep = null;
          filterQuick = null;
        } else if (btn.dataset.filterType === 'all') {
          filterStep = null;
          filterPhase = null;
          filterStatus = null;
          filterServiceArea = null;
          filterQuick = null;
        } else if (btn.dataset.filterType === 'quick') {
          filterQuick = btn.dataset.filter;
          filterStep = null;
          filterPhase = null;
          filterStatus = null;
        }
        render();
      });
    });
    document.querySelectorAll('.phase-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterStep = btn.dataset.phase;
        filterPhase = null;
        filterStatus = null;
        filterServiceArea = null;
        filterQuick = null;
        render();
      });
    });
    const drawResults = () => {
      const box = document.getElementById('field-find-results');
      if (!box) return;
      const hits = findFields(getProject(id), searchQuery);
      if (searchQuery.trim().length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = hits.length ? `<ul class="field-find-list">${hits.map(h => `
        <li class="field-find-hit field-find-${h.state}">
          <span class="field-find-name">${fieldTag(h.side, `${h.table}.${h.column}`, esc)}</span>
          <span>${esc(resultLine(h))}</span>
          ${h.removed.length ? `<span class="recon-sub">${h.removed.map(r => `Removed match to ${esc(r.to)}: ${esc(r.reason)} (${esc(r.by)})`).join('. ')}.</span>` : ''}
          ${h.matches.map(m => `<button type="button" class="btn btn-ghost btn-sm field-find-open" data-id="${esc(m.id)}">Open the record for ${esc(m.to)}</button>`).join('')}
        </li>`).join('')}</ul>` : `<p class="recon-sub">${esc(RECORD_TEXT.noResults)}</p>`;
      box.querySelectorAll('.field-find-open').forEach(b => b.addEventListener('click', () => {
        const m = getProject(id).mappings.find(x => x.id === b.dataset.id);
        if (m) openMappingDrawer(m, id, null, getProject(id));
      }));
    };
    document.getElementById('field-find-input')?.addEventListener('input', e => { searchQuery = e.target.value; drawResults(); });
    drawResults();
    document.getElementById('show-conflicts')?.addEventListener('click', () => {
      filterQuick = 'conflict';
      filterStep = null;
      filterPhase = null;
      filterStatus = null;
      filterServiceArea = null;
      render();
    });
    bindServiceAreaSelects(id, render);
    bindTraceClicks(id, render);
    document.querySelectorAll('.verification-table tr[data-mapping-id] .col-mapping, .verification-table tr[data-mapping-id] .col-status').forEach(cell => {
      cell.addEventListener('click', () => {
        const row = cell.closest('tr');
        const m = getProject(id).mappings.find(x => x.id === row.dataset.mappingId);
        openMappingDrawer(m, id, null, getProject(id));
      });
    });
    bindDashboardActivityClicks(id);
    document.getElementById('trace-dashboard-panel')?.addEventListener('toggle', e => {
      dashboardOpen = e.target.open;
      if (dashboardOpen) {
        scheduleDashboardCharts(getProject(id).mappings);
      } else {
        destroyDashboardCharts();
      }
    });
    if (dashboardOpen) {
      scheduleDashboardCharts(project.mappings);
    }
  }

  function bindDashboardActivityClicks(projectId) {
    document.querySelectorAll('.dash-activity-item[data-mapping-id]').forEach(el => {
      const open = () => {
        const m = getProject(projectId).mappings.find(x => x.id === el.dataset.mappingId);
        if (m) openMappingDrawer(m, projectId, null, getProject(projectId));
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  render();
  attachLogout();
}

function handleTraceRevertClick(projectId, mappingId, stepKey, rerender) {
  const p = getProject(projectId);
  const m = p.mappings.find(x => x.id === mappingId);
  if (!m || !canRevertTraceStep(m, stepKey)) return;

  const step = TRACE_STEPS.find(s => s.key === stepKey);
  if (!step) return;

  const ok = confirm(
    `Go back to "${step.action}"?\n\nYou can re-do from here. All previous attempts stay in the audit log with dates and names.`
  );
  if (!ok) return;

  const user = getCurrentUser();
  if (!revertToTraceStep(m, stepKey, { by: user?.name || 'unknown' })) {
    toast('Could not revert');
    return;
  }
  saveProject(p);
  toast(`Reverted — re-do from ${step.action}`);
  rerender?.();
}

async function handleTraceStepClick(projectId, mappingId, stepKey, rerender) {
  const p = getProject(projectId);
  const m = p.mappings.find(x => x.id === mappingId);
  if (!m || nextTraceStepKey(m) !== stepKey) return;

  const step = TRACE_STEPS.find(s => s.key === stepKey);
  if (!step) return;

  let pass = true;
  let note = '';
  let reference = '';
  if (step.checkStep) {
    const answer = await showPassModal({ step, mapping: m });
    if (!answer) return;
    ({ pass, note, reference } = answer);
  }

  // Link the step to the evidence: what did the latest load check find for this field?
  const claimsPass = pass && (step.checkStep || stepKey === 'done');
  if (claimsPass) {
    const check = fieldCheckIndex(p, p.reconRuns || [], { finalRunId: p.reconFinalRunId || null }).get(m.id);
    if (check?.state === 'fail') {
      const reason = await showCheckWarningModal({ step, mapping: m, check });
      if (!reason) return;
      note = `${step.action}. Recorded as passed although the latest file comparison found differences (${check.run.label}). Reason: ${reason}`;
    } else if (checkNote(check)) {
      note = `${step.action}. ${checkNote(check)}`;
    }
  }

  const user = getCurrentUser();
  const teamNames = getProjectTeamNames(p, getUsers());
  const participants = await showParticipantModal({
    step,
    teamNames,
    defaultName: user?.name || '',
    multi: step.checkStep,
  });
  if (!participants?.length) return;

  if (!recordTraceStep(m, stepKey, { by: participants[0], participants, pass, note, reference })) {
    toast('Could not record step');
    return;
  }
  saveProject(p);
  toast(`${step.action} recorded`);
  rerender?.();
}

// The latest load check for one field, as shown on its tracker row.
function renderCheckCell(projectId, check, conflict) {
  if (!check) return '<span class="recon-chip recon-low">Not checked</span>';
  const chip = { pass: 'recon-ok', fail: 'recon-high', recheck: 'recon-medium', not_checked: 'recon-low' }[check.state];
  const n = check.findings.length;
  const label = check.state === 'fail'
    ? (check.mismatched ? `${check.mismatched.toLocaleString('en-GB')} ${check.mismatched === 1 ? 'difference' : 'differences'}` : 'Total differs')
    : CHECK_LABEL[check.state];
  const detail = check.state === 'fail' && n ? esc(check.findings.map(f => f.title).join(' · ')) : esc(check.reason || '');
  const where = check.run
    ? `<a class="check-run" href="#/projects/${projectId}/reconcile/${check.run.id}">${esc(check.run.label)}</a>`
    : '';
  return `<span class="recon-chip ${chip}"${detail ? ` title="${detail}"` : ''}>${esc(label)}</span>
    ${where}${conflict ? '<span class="check-conflict">Marked as passed</span>' : ''}`;
}

// Shown when someone records a pass on a field whose latest load check found
// differences. They can still record it, but must say why, and the reason
// goes into the field's history.
function showCheckWarningModal({ step, mapping, check }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'record-modal-backdrop';
    const findings = check.findings.slice(0, 5);
    backdrop.innerHTML = `
      <div class="record-modal" role="dialog" aria-modal="true" aria-labelledby="check-warn-title" style="width:min(560px,calc(100% - 2rem))">
        <h3 id="check-warn-title">The latest file comparison found differences</h3>
        <p class="record-modal-sub">${fieldPairHtml(mapping, esc)} · ${esc(check.run.label)}</p>
        <ul class="check-warn-list">
          ${findings.map(f => `<li>${esc(f.title)}${f.kind === 'total_differs' || f.kind === 'not_checked' ? '' : ` <span class="recon-sub" style="display:inline">(${f.count.toLocaleString('en-GB')} ${f.count === 1 ? 'record' : 'records'})</span>`}</li>`).join('')}
          ${check.findings.length > findings.length ? `<li>…and ${check.findings.length - findings.length} more</li>` : ''}
        </ul>
        <div class="field" style="margin:0.75rem 0 0">
          <label for="check-warn-reason">To record "${esc(step.action)}" as passed anyway, say why</label>
          <textarea id="check-warn-reason" rows="2" placeholder="For example: fixed by the supplier on 14 November, to be confirmed in the next load"></textarea>
        </div>
        <div class="record-modal-actions">
          <a class="btn btn-ghost btn-sm" href="#/projects/${getCurrentProjectId()}/reconcile/${check.run.id}" id="check-warn-report">Open the report</a>
          <button type="button" class="btn btn-ghost btn-sm" id="check-warn-cancel">Cancel</button>
          <button type="button" class="btn btn-danger btn-sm" id="check-warn-confirm">Record as passed anyway</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = result => { backdrop.remove(); resolve(result); };
    backdrop.querySelector('#check-warn-cancel').onclick = () => close(null);
    backdrop.querySelector('#check-warn-report').onclick = () => close(null);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(null); });
    backdrop.querySelector('#check-warn-confirm').onclick = () => {
      const reason = backdrop.querySelector('#check-warn-reason').value.trim();
      if (!reason) { showErrors(backdrop.querySelector('.record-modal'), [{ id: 'check-warn-reason', text: GOVUK_TEXT.sayWhy }]); return; }
      close(reason);
    };
    backdrop.querySelector('#check-warn-reason').focus();
  });
}

// The project id from the current address, for links built inside dialogs.
function getCurrentProjectId() {
  return (/#\/projects\/([^/]+)/.exec(location.hash) || [])[1] || '';
}

function bindTraceClicks(projectId, rerender) {
  document.querySelectorAll('.trace-node-btn[data-action="record"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleTraceStepClick(projectId, btn.dataset.mappingId, btn.dataset.stepKey, rerender);
    });
  });
  document.querySelectorAll('.trace-node-btn[data-action="revert"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleTraceRevertClick(projectId, btn.dataset.mappingId, btn.dataset.stepKey, rerender);
    });
  });
}

function traceNodeTitle(mapping, step, t, visual) {
  const attempts = countStepAttempts(mapping, step.key);
  const attemptNote = attempts > 1 ? ` · ${attempts} attempts logged` : '';
  const who = t ? formatStepNames(t) : '';
  if (t && visual === 'done') {
    return `${step.action} · ${who} · ${new Date(t.at).toLocaleString()}${attemptNote} · Select to undo`;
  }
  if (t && visual === 'failed') {
    return `${step.action} failed · ${who} · ${new Date(t.at).toLocaleString()}${attemptNote} · Select to undo and redo`;
  }
  if (visual === 'next') return `Click to record: ${step.action}`;
  return `${step.action} — not yet`;
}

function renderTraceStrip(mapping, { interactive = false, mappingId = '', compact = false } = {}) {
  const trace = columnTraceability(mapping);
  return `<div class="trace-pipeline${compact ? ' trace-pipeline-compact' : ''}">${TRACE_STEPS.map((step, i) => {
    const t = trace[step.key];
    const visual = traceStepVisualState(mapping, step.key);
    const prevVisual = i > 0 ? traceStepVisualState(mapping, TRACE_STEPS[i - 1].key) : null;
    const prevDone = prevVisual === 'done' || prevVisual === 'failed';
    const title = traceNodeTitle(mapping, step, t, visual);
    const connector = i > 0
      ? `<div class="trace-connector ${prevDone ? 'done' : ''}" aria-hidden="true"></div>`
      : '';
    const inner = compact
      ? `<div class="trace-node-marker" aria-hidden="true">${visual === 'done' || visual === 'failed' ? (visual === 'failed' ? '!' : '✓') : visual === 'next' ? '+' : ''}</div>`
      : `
      <div class="trace-node-marker" aria-hidden="true">${visual === 'done' || visual === 'failed' ? (visual === 'failed' ? '!' : '✓') : visual === 'next' ? '+' : ''}</div>
      <div class="trace-node-text">
        <span class="trace-action">${esc(step.action)}</span>
        <span class="trace-person">${t ? esc(formatStepNames(t)) : visual === 'next' ? 'Select to record' : 'Not done yet'}${t && countStepAttempts(mapping, step.key) > 1 ? ` · ×${countStepAttempts(mapping, step.key)}` : ''}</span>
      </div>`;
    if (interactive && visual === 'next') {
      return `${connector}<button type="button" class="trace-node trace-node-btn ${visual}" title="${esc(title)}"
        data-action="record" data-mapping-id="${mappingId}" data-step-key="${step.key}" aria-label="Record ${esc(step.action)}">${inner}</button>`;
    }
    if (interactive && canRevertTraceStep(mapping, step.key)) {
      return `${connector}<button type="button" class="trace-node trace-node-btn revert ${visual}" title="${esc(title)}"
        data-action="revert" data-mapping-id="${mappingId}" data-step-key="${step.key}" aria-label="Go back to ${esc(step.action)}">${inner}</button>`;
    }
    return `${connector}<div class="trace-node ${visual}" title="${esc(title)}">${inner}</div>`;
  }).join('')}</div>`;
}

function renderTraceDetail(mapping, { interactive = false, mappingId = '' } = {}) {
  const trace = columnTraceability(mapping);
  return `<div class="trace-timeline">${TRACE_STEPS.map((step, i) => {
    const t = trace[step.key];
    const visual = traceStepVisualState(mapping, step.key);
    const isLast = i === TRACE_STEPS.length - 1;
    const markerContent = visual === 'done' ? '✓' : visual === 'failed' ? '!' : visual === 'next' ? '+' : '';
    const title = traceNodeTitle(mapping, step, t, visual);
    const body = `
      <div class="trace-timeline-content">
        <div class="trace-action">${esc(step.action)}</div>
        ${t
          ? `<div class="trace-meta"><span class="trace-person-name">${esc(formatStepNames(t))}</span><span class="trace-date">${new Date(t.at).toLocaleString()}${countStepAttempts(mapping, step.key) > 1 ? ` · ${countStepAttempts(mapping, step.key)} attempts logged` : ''}</span></div>`
          : visual === 'next'
            ? '<div class="trace-meta trace-meta-next">Select the tick to record</div>'
            : '<div class="trace-meta trace-meta-pending">Not yet recorded</div>'}
        ${interactive && canRevertTraceStep(mapping, step.key) ? '<div class="trace-meta trace-meta-revert">Select to undo and redo</div>' : ''}
      </div>`;
    if (interactive && visual === 'next') {
      return `<button type="button" class="trace-timeline-item trace-timeline-btn ${visual} trace-node-btn"
        data-action="record" data-mapping-id="${mappingId}" data-step-key="${step.key}" aria-label="Record ${esc(step.action)}" title="${esc(title)}">
        <div class="trace-timeline-rail"${isLast ? ' aria-hidden="true"' : ''}>
          <div class="trace-timeline-marker">${markerContent}</div>
          ${isLast ? '' : '<div class="trace-timeline-line"></div>'}
        </div>
        ${body}
      </button>`;
    }
    if (interactive && canRevertTraceStep(mapping, step.key)) {
      return `<button type="button" class="trace-timeline-item trace-timeline-btn revert ${visual} trace-node-btn"
        data-action="revert" data-mapping-id="${mappingId}" data-step-key="${step.key}" aria-label="Go back to ${esc(step.action)}" title="${esc(title)}">
        <div class="trace-timeline-rail"${isLast ? ' aria-hidden="true"' : ''}>
          <div class="trace-timeline-marker">${markerContent}</div>
          ${isLast ? '' : '<div class="trace-timeline-line"></div>'}
        </div>
        ${body}
      </button>`;
    }
    return `<div class="trace-timeline-item ${visual}">
      <div class="trace-timeline-rail"${isLast ? ' aria-hidden="true"' : ''}>
        <div class="trace-timeline-marker">${markerContent}</div>
        ${isLast ? '' : '<div class="trace-timeline-line"></div>'}
      </div>
      ${body}
    </div>`;
  }).join('')}</div>`;
}

function renderPhaseBar(traceCounts, activeStep = null) {
  return `<div class="phase-bar">${TRACE_STEPS.map(step => {
    const n = traceCounts[step.key] || 0;
    const isActive = activeStep === step.key;
    const short = step.action;
    return `<button type="button" class="phase-step-btn phase-step ${isActive ? 'current' : ''}" data-phase="${step.key}" title="${esc(step.action)}: ${n} so far">
      <span class="phase-step-label">${esc(short)}</span><span class="phase-count">${n}</span>
    </button>`;
  }).join('')}</div>`;
}

function openMappingDrawer(mapping, projectId, _activeTab = 'mapping', project = null) {
  const drawer = document.getElementById('mapping-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!mapping) {
    closeDrawer();
    return;
  }
  ensureVerification(mapping);
  const fromVerify = location.hash.includes('/verify');
  const proj = project || getProject(projectId);
  ensureProjectServiceAreas(proj);
  const serviceAreas = getProjectServiceAreaNames(proj);
  const history = [...mapping.verification.history];
  const current = statusMeta(mapping.verification.status);
  const sourceCol = getSchemaColumn(proj.sourceSchema, mapping.sourceTable, mapping.sourceColumn);
  const targetCol = getSchemaColumn(proj.targetSchema, mapping.targetTable, mapping.targetColumn);
  const valueMismatch = valuesFormatMismatch(sourceCol, targetCol);

  drawer.classList.add('open');
  backdrop?.classList.add('open');

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-header-top">
        <div>
          <div class="drawer-title">Field</div>
          <div class="drawer-col-ref">${esc(mapping.sourceTable)}.${esc(mapping.sourceColumn)}<br>→ ${esc(mapping.targetTable)}.${esc(mapping.targetColumn)}</div>
        </div>
        <button class="drawer-close" id="close-drawer" aria-label="Close">×</button>
      </div>
      <div class="field" style="margin:0.65rem 0 0">
        <label>Service area</label>
        <select class="service-area-select" id="drawer-service-area" data-mapping-id="${mapping.id}">
          ${renderServiceAreaOptions(serviceAreas, mapping.serviceArea || '')}
        </select>
      </div>
      <p style="margin:0.5rem 0 0"><span class="status-badge" style="background:${current.color}18;color:${current.color}">${current.label}</span></p>
      <p class="drawer-hint">${fromVerify
    ? 'Select + to record the next step. Select a completed tick to undo it. Every action is kept in the record below.'
    : 'What each field means is shown below. Check how the values are written before you match.'}</p>
    </div>
    <div class="drawer-body">
      <details class="drawer-section" open>
        <summary>What each field means</summary>
        <div class="drawer-section-body">
          <div class="col-def-grid">
            ${renderColumnDefinitionCard(oldLabel(proj), sourceCol, 'col-def-source')}
            ${renderColumnDefinitionCard(newLabel(proj), targetCol, 'col-def-target')}
          </div>
          ${valueMismatch ? `<div class="alert alert-warn col-def-alert">The values are written differently. ${esc(oldName(proj))} has <strong>${esc(sourceCol?.values || '')}</strong>, and ${esc(newName(proj))} expects <strong>${esc(targetCol?.values || '')}</strong>. Write the rule that turns one into the other in the notes of the filled table, so it is kept with the match.</div>` : ''}
        </div>
      </details>
      <details class="drawer-section"${fromVerify ? ' open' : ''}>
        <summary>Steps and history</summary>
        <div class="drawer-section-body">${renderTraceDetail(mapping, { interactive: fromVerify, mappingId: mapping.id })}</div>
      </details>
      <details class="drawer-section" open>
        <summary>Audit log · ${history.length} entries</summary>
        <div class="drawer-section-body" style="padding-top:0.5rem">
          ${history.length ? `<ul class="history-timeline">${history.map(h => {
            if (h.revertTo) {
              return `<li class="hist-revert">
                <div class="hist-status">↩ Reverted</div>
                ${h.note ? `<div class="hist-note">${esc(h.note)}</div>` : ''}
                <div class="hist-meta">${esc(h.by)} · ${new Date(h.at).toLocaleString('en-GB')}</div>
              </li>`;
            }
            const hm = statusMeta(h.status);
            return `<li>
              <div class="hist-status" style="color:${hm.color}">${hm.label}</div>
              ${h.note ? `<div class="hist-note">${esc(h.note)}</div>` : ''}
              <div class="hist-meta">${esc(h.participants?.length ? h.participants.join(', ') : h.by)} · ${new Date(h.at).toLocaleString('en-GB')}${h.reference ? ` · ${esc(h.reference)}` : ''}</div>
            </li>`;
          }).join('')}</ul>` : `<p style="font-size:0.8rem;color:var(--muted)">No history yet.</p>`}
        </div>
      </details>
    </div>
    <div class="drawer-footer">
      <details class="remove-match">
        <summary>${esc(RECORD_TEXT.removeTitle)}</summary>
        <form id="remove-match-form" class="remove-match-form">
          <p class="recon-sub">${esc(RECORD_TEXT.removeHint)}</p>
          <label for="remove-reason">${esc(RECORD_TEXT.reasonLabel)}</label>
          <p class="decision-error" id="remove-error" hidden>${esc(RECORD_TEXT.reasonNeeded)}</p>
          <input id="remove-reason" name="reason" type="text" autocomplete="off">
          <button type="submit" class="btn btn-danger btn-sm">${esc(RECORD_TEXT.removeConfirm)}</button>
        </form>
      </details>
    </div>
  `;

  document.getElementById('close-drawer').onclick = closeDrawer;
  backdrop.onclick = closeDrawer;

  if (fromVerify) {
    bindTraceClicks(projectId, () => {
      renderVerify({ id: projectId });
      const updated = getProject(projectId).mappings.find(x => x.id === mapping.id);
      if (updated) openMappingDrawer(updated, projectId, null, getProject(projectId));
    });
    bindServiceAreaSelects(projectId, () => {
      renderVerify({ id: projectId });
      const updated = getProject(projectId).mappings.find(x => x.id === mapping.id);
      if (updated) openMappingDrawer(updated, projectId, null, getProject(projectId));
    });
  }

  document.getElementById('remove-match-form').onsubmit = e => {
    e.preventDefault();
    const reason = String(document.getElementById('remove-reason').value || '').trim();
    if (!reason) {
      document.getElementById('remove-error').hidden = false;
      document.getElementById('remove-reason').focus();
      return;
    }
    const p = getProject(projectId);
    const current = p.mappings.find(x => x.id === mapping.id) || mapping;
    retireMatch(p, current, { by: getCurrentUser()?.name || 'unknown', reason, kind: 'removed' });
    p.mappings = p.mappings.filter(x => x.id !== mapping.id);
    saveProject(p);
    if (canvasInstance && location.hash.endsWith('/map')) canvasInstance.deleteMapping(mapping.id);
    closeDrawer();
    toast(RECORD_TEXT.removed);
    if (location.hash.includes('/verify')) renderVerify({ id: projectId });
  };
}

// Records that the evidence pack was downloaded, with a digest of what it
// contained, so a later change to the project can be detected.
function markEvidenceExported(id, user) {
  const p = getProject(id);
  if (!p) return;
  // Make sure every mapping carries its tracker record before taking the
  // digest, so the digest is the same next time the project is read.
  p.mappings.forEach(ensureVerification);
  p.lastEvidenceExportAt = new Date().toISOString();
  p.lastEvidenceDigest = evidenceDigest(buildExportPackage(p, user));
  saveProject(p);
}

function renderExport({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();
  const user = getCurrentUser();
  const stats = mappingProgress(project.sourceSchema, project.targetSchema, project.mappings);

  project.mappings.forEach(ensureVerification);
  const vCounts = verificationSummary(project.mappings);
  const reconRuns = project.reconRuns || [];
  const areaSignoffs = project.reconAreaSignoffs || [];
  const evidenceChanged = Boolean(project.lastEvidenceExportAt)
    && project.lastEvidenceDigest !== evidenceDigest(buildExportPackage(project, user));
  const needsExport = !project.lastEvidenceExportAt || evidenceChanged;

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  mount(`
    ${projectSteps(project, 'export')}
    <div class="page-head"><div><h1>Hand over and close</h1><p>Download the evidence pack: the agreed matches, the field-by-field log, every checked load and every sign-off. Then close the project.</p></div></div>
    <div class="card" style="margin-bottom:1rem">
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:1rem">${stats.mappedCount} matches · ${stats.percent}% of new-system fields matched · ${vCounts.signed_off || 0} fields signed off in the tracker · ${reconRuns.length} checked ${reconRuns.length === 1 ? 'load' : 'loads'} · ${areaSignoffs.length} area ${areaSignoffs.length === 1 ? 'sign-off' : 'sign-offs'}</p>
      ${project.lastEvidenceExportAt ? `<p style="font-size:0.85rem;color:var(--muted)">Evidence pack last downloaded ${esc(new Date(project.lastEvidenceExportAt).toLocaleString('en-GB'))}.${evidenceChanged ? ' <strong style="color:var(--warn)">The project has changed since then.</strong>' : ''}</p>` : ''}
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Downloads</h3>
        <a class="btn btn-primary" href="#/projects/${id}/report">Open the sign-off report</a>
        <p class="recon-sub" style="margin:0.5rem 0 1rem">What happened to every field, ready to print, sign and attach to a milestone certificate.</p>
        <button class="btn btn-secondary" id="export-json">Download the evidence pack</button>
        <p class="recon-sub" style="margin:0.5rem 0 0">One file with the whole story of this move, with a fingerprint so changes can be spotted. Keep it safe.</p>
        <details class="other-ways">
          <summary>Other downloads</summary>
          <div class="other-ways-body">
            <button class="btn btn-ghost btn-sm" id="export-csv">Matches (CSV)</button>
            <button class="btn btn-ghost btn-sm" id="export-xlsx">Matches and field log (Excel)</button>
            <button class="btn btn-ghost btn-sm" id="export-sql">Starter SQL</button>
          </div>
        </details>
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.75rem;color:var(--danger)">Close & delete project</h3>
        <p style="font-size:0.88rem;color:var(--muted);margin-bottom:1rem">All field lists, matches, checked loads, reports, sign-offs and comments are deleted for good. You keep only what you exported.</p>
        ${needsExport ? `<p class="recon-error" style="margin-bottom:1rem">${project.lastEvidenceExportAt ? 'The project has changed since the evidence pack was last downloaded.' : 'The evidence pack has not been downloaded.'} ${reconRuns.length ? `Closing now would lose ${reconRuns.length} checked ${reconRuns.length === 1 ? 'load' : 'loads'} and ${areaSignoffs.length} area ${areaSignoffs.length === 1 ? 'sign-off' : 'sign-offs'}.` : 'Closing now would lose the matches and the field log.'}</p>` : ''}
        <button class="btn btn-danger" id="close-project">Close project & wipe data</button>
      </div>
    </div>
  `);
  attachLogout();

  document.getElementById('export-json').onclick = async () => {
    const pkg = buildExportPackage(project, user);
    try { pkg.fingerprint = await evidenceFingerprint(pkg); } catch { /* fingerprint needs a secure page */ }
    downloadJSON(pkg, `${slug(project.name)}-evidence-pack.json`);
    markEvidenceExported(id, user);
    toast('Evidence pack downloaded');
    renderExport({ id });
  };
  document.getElementById('export-csv').onclick = () => {
    downloadCSV(mappingsToRows(project.mappings), `${slug(project.name)}-mapping.csv`);
    toast('CSV exported');
  };
  document.getElementById('export-xlsx').onclick = () => {
    downloadExcel(project.mappings, `${slug(project.name)}-mapping.xlsx`);
    toast('Excel exported');
  };
  document.getElementById('export-sql').onclick = () => {
    const blob = new Blob([generateSQLStubs(project.mappings)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(project.name)}-stubs.sql`;
    a.click();
    toast('Starter SQL downloaded');
  };
  document.getElementById('close-project').onclick = e => {
    const btn = e.currentTarget;
    if (btn.dataset.armed !== 'yes') {
      btn.dataset.armed = 'yes';
      btn.textContent = needsExport ? 'Delete without a current evidence pack' : 'Confirm: delete everything';
      return;
    }
    deleteProject(id);
    toast('Project deleted');
    location.hash = '#/dashboard';
  };
}

function renderNotFound() {
  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';
  mount(`<div class="card"><h2>Not found</h2><p><a href="#/dashboard">Back to dashboard</a></p></div>`);
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

function openConnectorImportModal(side, projectId) {
  const backdrop = document.createElement('div');
  backdrop.className = 'record-modal-backdrop';
  backdrop.innerHTML = `
    <div class="record-modal" role="dialog" aria-modal="true" style="width:min(520px,calc(100% - 2rem))">
      <h3>Import from connector file</h3>
      <p class="record-modal-sub">Choose the JSON file made by the MapBridge connector.</p>
      
      <div class="field" style="margin:1rem 0">
        <label>Select connector output file</label>
        <input type="file" id="connector-file-input" accept=".json">
      </div>
      
      <div id="connector-preview" style="display:none;margin:1rem 0;padding:1rem;background:#f8fafc;border:1px solid var(--line);border-radius:8px">
        <h4 style="font-size:0.9rem;margin-bottom:0.5rem">Preview</h4>
        <div id="connector-preview-content"></div>
      </div>
      
      <div class="record-modal-actions" style="margin-top:1.25rem">
        <button type="button" class="btn btn-ghost btn-sm" id="connector-cancel">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="connector-apply" disabled>Apply</button>
      </div>
    </div>`;
  
  document.body.appendChild(backdrop);
  
  let loadedSchema = null;
  
  backdrop.querySelector('#connector-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await readFileAsText(file);
      const schema = parseJSONSchema(text);
      
      // Check if it's a connector file (has system and tables)
      if (!schema.system || !schema.tables) {
        throw new Error('Invalid connector file format. Expected JSON with "system" and "tables" fields.');
      }
      
      loadedSchema = schema;
      
      // Show preview
      const stats = schemaStats(schema);
      const previewEl = backdrop.querySelector('#connector-preview');
      const contentEl = backdrop.querySelector('#connector-preview-content');
      
      contentEl.innerHTML = `
        <div style="font-size:0.85rem">
          <p><strong>System:</strong> ${esc(schema.system)}</p>
          <p><strong>Tables:</strong> ${stats.tables}</p>
          <p><strong>Fields:</strong> ${stats.columns}</p>
          ${schema.importedAt ? `<p style="color:var(--muted);font-size:0.78rem;margin-top:0.5rem">Extracted: ${new Date(schema.importedAt).toLocaleString()}</p>` : ''}
        </div>`;
      
      previewEl.style.display = 'block';
      backdrop.querySelector('#connector-apply').disabled = false;
      
    } catch (err) {
      alert(`Error loading connector file: ${err.message}`);
    }
  });
  
  backdrop.querySelector('#connector-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  
  backdrop.querySelector('#connector-apply').onclick = () => {
    if (!loadedSchema) return;
    
    const p = getProject(projectId);
    p[side === 'source' ? 'sourceSchema' : 'targetSchema'] = loadedSchema;
    saveProject(p);
    
    toast('Field list added from the connector file');
    backdrop.remove();
    renderSetup({ id: projectId });
  };
}

// showKey: open with the key box visible (the screenshot reader needs a key in any mode).
function openAISettingsModal(onSave, { showKey = false } = {}) {
  const settings = getAISettings();
  const backdrop = document.createElement('div');
  backdrop.className = 'record-modal-backdrop';
  backdrop.innerHTML = `
    <div class="record-modal ai-settings-modal" role="dialog" aria-modal="true" style="width:min(520px,calc(100% - 2rem))">
      <h3>AI settings</h3>
      <p class="record-modal-sub">Choose how MapBridge suggests matches and reads screenshots.</p>
      
      <div class="field" style="margin:1rem 0 0.5rem">
        <label>How to suggest matches</label>
        <select id="ai-mode">
          <option value="heuristic" ${settings.mode === 'heuristic' ? 'selected' : ''}>Built-in rules (no AI, nothing sent anywhere)</option>
          <option value="llm" ${settings.mode === 'llm' ? 'selected' : ''}>AI service (needs an OpenAI-compatible service)</option>
        </select>
      </div>
      
      <div id="llm-settings" style="display:${settings.mode === 'llm' || showKey ? 'block' : 'none'}">
        <div class="alert alert-info" style="font-size:0.82rem;margin:0.75rem 0">
          <strong>Privacy:</strong> Suggested matches send only field lists (names, types, definitions, allowed values). No row data.
          If you use the screenshot reader, the pictures you choose are sent too, and they may show personal data.
          Your API key is stored in this browser only and is sent only to the address you set here.
        </div>
        
        <div class="field">
          <label>API Base URL</label>
          <input type="text" id="ai-base-url" value="${esc(settings.baseURL)}" placeholder="https://api.openai.com/v1">
          <small style="display:block;color:var(--muted);margin-top:0.3rem">Using Ollama on this computer? Use <code>http://localhost:11434/v1</code> and a vision model. No key is needed. The pictures stay on this computer, unless the model name ends in <code>:cloud</code>.</small>
        </div>
        
        <div class="field">
          <label>Model</label>
          <input type="text" id="ai-model" value="${esc(settings.model)}" placeholder="gpt-4o-mini">
        </div>
        
        <div class="field">
          <label>API Key</label>
          <input type="password" id="ai-api-key" value="${esc(settings.apiKey)}" placeholder="sk-... (leave empty for Ollama)" autocomplete="off">
        </div>
        <div class="field">
          <label class="shot-agree"><input type="checkbox" id="ai-remember-key" ${settings.rememberKey ? 'checked' : ''}> Remember the key on this computer</label>
          <p class="recon-sub" style="margin:0.25rem 0 0">If you leave this unticked, the key is forgotten when you close this browser window. The key is only ever sent to the AI address above.</p>
          ${settings.apiKey ? '<button type="button" class="btn-link" id="ai-forget-key">Remove the key from this computer</button>' : ''}
        </div>
      </div>
      
      <div class="record-modal-actions" style="margin-top:1.25rem">
        <button type="button" class="btn btn-ghost btn-sm" id="ai-settings-cancel">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="ai-settings-save">Save settings</button>
      </div>
    </div>`;
  
  document.body.appendChild(backdrop);
  
  const modeSelect = backdrop.querySelector('#ai-mode');
  const llmSettings = backdrop.querySelector('#llm-settings');
  
  modeSelect.addEventListener('change', () => {
    llmSettings.style.display = modeSelect.value === 'llm' || showKey ? 'block' : 'none';
  });
  
  backdrop.querySelector('#ai-settings-cancel').onclick = () => backdrop.remove();
  backdrop.querySelector('#ai-forget-key')?.addEventListener('click', () => {
    forgetAIKey();
    backdrop.querySelector('#ai-api-key').value = '';
    toast('AI key removed from this computer');
  });
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  
  backdrop.querySelector('#ai-settings-save').onclick = () => {
    const newSettings = {
      mode: modeSelect.value,
      baseURL: backdrop.querySelector('#ai-base-url').value.trim(),
      model: backdrop.querySelector('#ai-model').value.trim(),
      apiKey: backdrop.querySelector('#ai-api-key').value.trim(),
      rememberKey: backdrop.querySelector('#ai-remember-key').checked,
    };
    saveAISettings(newSettings);
    toast('AI settings saved');
    backdrop.remove();
    onSave?.();
  };
}

async function openAISuggestModal(projectId) {
  const project = getProject(projectId);
  const settings = getAISettings();
  
  const backdrop = document.createElement('div');
  backdrop.className = 'record-modal-backdrop';
  backdrop.innerHTML = `
    <div class="record-modal ai-suggest-modal" role="dialog" aria-modal="true" style="width:min(900px,calc(100% - 2rem));max-height:calc(100vh - 4rem);overflow:auto">
      <h3>Suggested matches</h3>
      <p class="record-modal-sub">Using: <strong>${settings.mode === 'heuristic' ? 'built-in rules (no AI)' : 'your AI service'}</strong> · 
        <button type="button" class="btn-link" id="change-mode" style="color:var(--brand);text-decoration:underline;background:none;border:none;padding:0;cursor:pointer">Change in settings</button>
      </p>
      <div id="suggestion-status" style="margin:1rem 0;padding:0.75rem;background:#f8fafc;border:1px solid var(--line);border-radius:8px;text-align:center">
        <button type="button" class="btn btn-primary btn-sm" id="generate-suggestions">Generate suggestions</button>
      </div>
      <div id="suggestions-list"></div>
      <div class="record-modal-actions" style="margin-top:1.25rem">
        <button type="button" class="btn btn-ghost btn-sm" id="ai-suggest-close">Close</button>
      </div>
    </div>`;
  
  document.body.appendChild(backdrop);
  
  backdrop.querySelector('#change-mode').onclick = () => {
    backdrop.remove();
    openAISettingsModal();
  };
  
  backdrop.querySelector('#ai-suggest-close').onclick = () => { backdrop.remove(); if (location.hash.endsWith('/map')) renderMap({ id: projectId }); };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  
  let suggestions = [];
  
  backdrop.querySelector('#generate-suggestions').onclick = async () => {
    const statusEl = backdrop.querySelector('#suggestion-status');
    const listEl = backdrop.querySelector('#suggestions-list');
    
    statusEl.innerHTML = '<p style="color:var(--muted)">Generating suggestions...</p>';
    listEl.innerHTML = '';
    
    try {
      if (settings.mode === 'heuristic') {
        suggestions = generateHeuristicSuggestions(project.sourceSchema, project.targetSchema, project.mappings);
      } else {
        suggestions = await generateLLMSuggestions(project.sourceSchema, project.targetSchema, project.mappings, settings);
      }
      
      if (suggestions.length === 0) {
        statusEl.innerHTML = '<p style="color:var(--muted)">No new suggestions. The likely matches may all be made already.</p>';
        return;
      }
      
      statusEl.innerHTML = `<p style="color:var(--ink)"><strong>${suggestions.length}</strong> suggestion${suggestions.length > 1 ? 's' : ''} found. Review and accept the ones you want:</p>`;
      
      const strong = suggestions.filter(s => s.confidence >= STRONG_SUGGESTION).length;
      listEl.innerHTML = `
        <p class="recon-sub" style="margin:0 0 0.5rem">Each field is suggested once, against the table it fits best. Check each one: a wrong match puts data in the wrong place.</p>
        <div style="margin-bottom:0.75rem;display:flex;gap:0.5rem;justify-content:flex-end;flex-wrap:wrap">
          ${strong ? `<button type="button" class="btn btn-ghost btn-sm" id="accept-all-suggestions">Accept the ${strong} strong ${strong === 1 ? 'one' : 'ones'} (${Math.round(STRONG_SUGGESTION * 100)}% or more)</button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="reject-all-suggestions">Reject all</button>
        </div>
        <div class="suggestions-grid">${suggestions.map((s, i) => renderSuggestion(s, i)).join('')}</div>`;
      
      const acceptAll = listEl.querySelector('#accept-all-suggestions');
      if (acceptAll) acceptAll.onclick = () => {
        suggestions.forEach((s, i) => { if (s.confidence >= STRONG_SUGGESTION) acceptSuggestion(projectId, suggestions, i, backdrop); });
      };
      
      listEl.querySelector('#reject-all-suggestions').onclick = () => {
        suggestions.forEach((_, i) => rejectSuggestion(suggestions, i, backdrop));
      };
      
      listEl.querySelectorAll('.suggestion-accept').forEach(btn => {
        btn.onclick = () => acceptSuggestion(projectId, suggestions, parseInt(btn.dataset.index), backdrop);
      });
      
      listEl.querySelectorAll('.suggestion-reject').forEach(btn => {
        btn.onclick = () => rejectSuggestion(suggestions, parseInt(btn.dataset.index), backdrop);
      });
      
    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error" style="text-align:left">${esc(err.message)}</div>`;
    }
  };
}

function renderSuggestion(suggestion, index) {
  const confidencePercent = Math.round(suggestion.confidence * 100);
  const confidenceColor = suggestion.confidence >= 0.8 ? '#059669' : suggestion.confidence >= 0.6 ? '#d97706' : '#6b7280';
  
  return `
    <div class="suggestion-card" id="suggestion-${index}" data-index="${index}">
      <div class="suggestion-header">
        <div class="suggestion-mapping">
          <code>${esc(suggestion.sourceTable)}.${esc(suggestion.sourceColumn)}</code>
          <span style="color:var(--muted);margin:0 0.5rem">→</span>
          <code>${esc(suggestion.targetTable)}.${esc(suggestion.targetColumn)}</code>
        </div>
        <div class="suggestion-confidence" style="background:${confidenceColor}18;color:${confidenceColor}">
          ${confidencePercent}% confident
        </div>
      </div>
      <div class="suggestion-reason">${esc(suggestion.reason)}</div>
      ${suggestion.valueTranslations?.length ? `
        <div class="suggestion-translations">
          <strong>Suggested value translations:</strong>
          ${suggestion.valueTranslations.map(t => `<code class="value-chip">${esc(t)}</code>`).join(' ')}
        </div>
      ` : ''}
      <div class="suggestion-actions">
        <button type="button" class="btn btn-primary btn-sm suggestion-accept" data-index="${index}">Accept</button>
        <button type="button" class="btn btn-ghost btn-sm suggestion-reject" data-index="${index}">Reject</button>
      </div>
    </div>`;
}

function acceptSuggestion(projectId, suggestions, index, backdrop) {
  const card = backdrop.querySelector(`#suggestion-${index}`);
  if (!card || card.classList.contains('suggestion-accepted')) return;
  
  const suggestion = suggestions[index];
  const p = getProject(projectId);
  const clash = p.mappings.find(m =>
    (m.sourceTable === suggestion.sourceTable && m.sourceColumn === suggestion.sourceColumn) ||
    (m.targetTable === suggestion.targetTable && m.targetColumn === suggestion.targetColumn));
  if (clash) {
    card.classList.add('suggestion-rejected');
    card.querySelector('.suggestion-actions').innerHTML = `<span style="color:var(--muted)">Not added: ${esc(clash.sourceColumn)} → ${esc(clash.targetColumn)} is already matched</span>`;
    return;
  }
  
  const lookupRule = suggestion.valueTranslations?.length 
    ? suggestion.valueTranslations.join('\n')
    : '';
  
  p.mappings.push({
    id: uid(),
    sourceTable: suggestion.sourceTable,
    sourceColumn: suggestion.sourceColumn,
    targetTable: suggestion.targetTable,
    targetColumn: suggestion.targetColumn,
    transformNotes: '',
    lookupRule,
    defaultValue: '',
    serviceArea: '',
    verification: defaultVerification(
      `AI-suggested (${suggestion.method}, ${Math.round(suggestion.confidence * 100)}% confidence)`,
      getCurrentUser()?.name || 'unknown'
    ),
  });
  
  saveProject(p);
  
  card.classList.add('suggestion-accepted');
  card.querySelector('.suggestion-actions').innerHTML = '<span style="color:#059669;font-weight:600">✓ Accepted</span>';
  
  toast('Match added');
}

function rejectSuggestion(suggestions, index, backdrop) {
  const card = backdrop.querySelector(`#suggestion-${index}`);
  if (!card || card.classList.contains('suggestion-rejected')) return;
  
  card.classList.add('suggestion-rejected');
  card.querySelector('.suggestion-actions').innerHTML = '<span style="color:var(--muted)">Rejected</span>';
}

