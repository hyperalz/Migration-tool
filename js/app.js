import { getCurrentUser, login, signup, logout, seedDemoUser } from './auth.js';
import {
  getProjects, getProject, saveProject, createProject, deleteProject,
  saveInvite, getInviteByToken, removeInvite, addMember, uid, getUsers,
} from './store.js';
import { synergySample, impulseSample, suggestedMappings } from './sampleData.js';
import {
  parseJSONSchema, parseCSVTemplate, schemaStats, mappingProgress, readFileAsText,
} from './schema.js';
import {
  buildExportPackage, downloadJSON, downloadCSV, downloadExcel, generateSQLStubs, mappingsToRows,
} from './export.js';
import { MappingCanvas } from './mapping.js';
import {
  VERIFICATION_STATUSES, PHASE_GROUPS, ensureVerification,
  verificationSummary, statusMeta, formatColumnRef, defaultVerification,
  countByPhase, filterMappings, columnTraceability, TRACE_STEPS, traceStepSummary,
  ensureProjectTeam, getProjectTeamNames, ensureProjectServiceAreas, getProjectServiceAreaNames,
  ensureMappingFields, countByServiceArea,
  nextTraceStepKey, traceStepVisualState, recordTraceStep, canRevertTraceStep, revertToTraceStep,
  countStepAttempts,
} from './verification.js';
import {
  buildTraceDashboardData, renderTraceDashboardHTML, mountDashboardCharts, destroyDashboardCharts,
} from './dashboard-charts.js';

let canvasInstance = null;
let toastTimer = null;

const routes = {
  '/login': renderLogin,
  '/signup': renderSignup,
  '/dashboard': renderDashboard,
  '/projects/new': renderNewProject,
  '/projects/:id/setup': renderSetup,
  '/projects/:id/invite': renderInvite,
  '/projects/:id/map': renderMap,
  '/projects/:id/verify': renderVerify,
  '/projects/:id/export': renderExport,
  '/invite/:token': renderAcceptInvite,
};

export function initApp() {
  seedDemoUser();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/login';
  route();
}

function route() {
  const hash = location.hash.slice(1) || '/login';
  const user = getCurrentUser();

  if (!user && !['/login', '/signup', '/invite'].some(p => hash.startsWith(p))) {
    location.hash = '#/login';
    return;
  }

  for (const [pattern, handler] of Object.entries(routes)) {
    const params = matchRoute(pattern, hash);
    if (params !== null) {
      closeDrawer();
      canvasInstance = null;
      handler(params);
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

function mount(html) {
  document.getElementById('app-main').innerHTML = html;
}

function nav(title = '') {
  const user = getCurrentUser();
  return `
    <nav class="app-nav">
      <a href="#/dashboard" class="logo"><span class="logo-mark">MB</span> MapBridge</a>
      <div style="display:flex;align-items:center;gap:0.75rem;font-size:0.85rem;color:var(--muted)">
        ${title ? `<span>${title}</span>` : ''}
        ${user ? `<span>${user.name}</span><button class="btn btn-ghost btn-sm" id="logout-btn">Sign out</button>` : ''}
      </div>
    </nav>`;
}

function projectSteps(project, active) {
  const steps = [
    { key: 'setup', label: 'Connect schemas', path: 'setup' },
    { key: 'invite', label: 'Invite party', path: 'invite' },
    { key: 'map', label: 'Map columns', path: 'map' },
    { key: 'verify', label: 'Test & live', path: 'verify' },
    { key: 'export', label: 'Export & close', path: 'export' },
  ];
  return `<div class="steps-bar">${steps.map(s => `
    <a href="#/projects/${project.id}/${s.path}" class="step-chip ${s.path === active ? 'active' : ''}">${s.label}</a>
  `).join('')}</div>`;
}

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

function renderLogin() {
  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="auth-page card">
      <h1>Sign in</h1>
      <p>Demo app — data stored locally in your browser.</p>
      <div class="alert alert-info">Demo account: <strong>demo@mapbridge.local</strong> / <strong>demo123</strong></div>
      <form id="login-form">
        <div class="field"><label>Email</label><input type="email" name="email" value="demo@mapbridge.local" required></div>
        <div class="field"><label>Password</label><input type="password" name="password" value="demo123" required></div>
        <button class="btn btn-primary" type="submit" style="width:100%">Sign in</button>
      </form>
      <p style="margin-top:1rem;font-size:0.88rem;color:var(--muted)">No account? <a href="#/signup" style="color:var(--brand);font-weight:600">Create one</a></p>
    </div>
  `);
  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      login({ email: fd.get('email'), password: fd.get('password') });
      location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderSignup() {
  document.getElementById('app-shell').innerHTML = nav() + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="auth-page card">
      <h1>Create account</h1>
      <p>Local demo — no server, no real auth.</p>
      <form id="signup-form">
        <div class="field"><label>Name</label><input name="name" required></div>
        <div class="field"><label>Email</label><input type="email" name="email" required></div>
        <div class="field"><label>Password</label><input type="password" name="password" required minlength="6"></div>
        <div class="field"><label>Organisation role</label>
          <select name="orgRole">
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
  document.getElementById('signup-form').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      signup(Object.fromEntries(fd));
      location.hash = '#/dashboard';
    } catch (err) {
      toast(err.message);
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
      <div><h1>Your migration projects</h1><p>Project-scoped workspaces. Export and delete when complete.</p></div>
      <a href="#/projects/new" class="btn btn-primary">+ New project</a>
    </div>
    ${projects.length ? `<div class="project-grid">${projects.map(p => `
      <a href="#/projects/${p.id}/setup" class="project-card">
        <h3>${esc(p.name)}</h3>
        <div class="project-meta">${esc(p.sourceSystem)} → ${esc(p.targetSystem)}</div>
        <span class="status-pill status-${p.status === 'closed' ? 'closed' : p.status === 'mapping' ? 'mapping' : 'active'}">${p.status}</span>
      </a>
    `).join('')}</div>` : `
      <div class="empty-state card">
        <p>No projects yet. Create one to connect schemas and start mapping.</p>
        <a href="#/projects/new" class="btn btn-primary" style="margin-top:1rem">Create first project</a>
      </div>`}
  `);
  attachLogout();
}

function renderNewProject() {
  document.getElementById('app-shell').innerHTML = nav('New project') + '<main class="app-main" id="app-main"></main>';
  mount(`
    <div class="page-head"><div><h1>New migration project</h1><p>Set up a project workspace for two parties to collaborate.</p></div></div>
    <div class="card" style="max-width:520px">
      <form id="new-project-form">
        <div class="field"><label>Project name</label><input name="name" placeholder="e.g. Birmingham LA — Synergy to Impulse" required></div>
        <div class="field"><label>Source system</label>
          <select name="sourceSystem">
            <option>Synergy (Access Group)</option>
            <option>Capita One</option>
            <option>SIMS</option>
            <option>Other / Generic</option>
          </select>
        </div>
        <div class="field"><label>Target system</label>
          <select name="targetSystem">
            <option>Impulse (CACI)</option>
            <option>Impulse Nexus</option>
            <option>Other / Generic</option>
          </select>
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
    toast('Project created');
    location.hash = `#/projects/${project.id}/setup`;
  });
}

function renderSetup({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  const srcStats = schemaStats(project.sourceSchema);
  const tgtStats = schemaStats(project.targetSchema);

  mount(`
    ${projectSteps(project, 'setup')}
    <div class="page-head"><div><h1>Connect schemas</h1><p>Upload JSON or CSV templates, or load sample education schemas.</p></div></div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Source · ${esc(project.sourceSystem)}</h3>
        <div class="upload-zone" id="source-upload">
          <input type="file" id="source-file" accept=".json,.csv">
          <p><strong>Drop JSON or CSV</strong> or click to browse</p>
          <p style="font-size:0.82rem;color:var(--muted);margin-top:0.35rem">Metadata only — table & column definitions</p>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:0.65rem" id="load-source-sample">Load Synergy sample</button>
        ${project.sourceSchema ? renderSchemaPreview(project.sourceSchema, srcStats) : ''}
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Target · ${esc(project.targetSystem)}</h3>
        <div class="upload-zone" id="target-upload">
          <input type="file" id="target-file" accept=".json,.csv">
          <p><strong>Drop JSON or CSV</strong> or click to browse</p>
          <p style="font-size:0.82rem;color:var(--muted);margin-top:0.35rem">Impulse-style CSV templates supported</p>
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:0.65rem" id="load-target-sample">Load Impulse sample</button>
        ${project.targetSchema ? renderSchemaPreview(project.targetSchema, tgtStats) : ''}
      </div>
    </div>
    <div style="margin-top:1.25rem;display:flex;gap:0.65rem">
      <a href="#/projects/${id}/invite" class="btn btn-secondary">Next: Invite party →</a>
      ${project.sourceSchema && project.targetSchema ? `
        <a href="#/projects/${id}/map" class="btn btn-primary">Start mapping →</a>` : ''}
    </div>
  `);
  attachLogout();
  setupUpload('source', id, project);
  setupUpload('target', id, project);
  document.getElementById('load-source-sample').addEventListener('click', () => {
    const p = getProject(id);
    p.sourceSchema = { ...synergySample };
    saveProject(p);
    toast('Synergy sample loaded');
    renderSetup({ id });
  });
  document.getElementById('load-target-sample').addEventListener('click', () => {
    const p = getProject(id);
    p.targetSchema = { ...impulseSample };
    saveProject(p);
    toast('Impulse sample loaded');
    renderSetup({ id });
  });
}

function setupUpload(side, projectId) {
  const zone = document.getElementById(`${side}-upload`);
  const input = document.getElementById(`${side}-file`);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleSchemaFile(e.dataTransfer.files[0], side, projectId);
  });
  input.addEventListener('change', e => {
    if (e.target.files[0]) handleSchemaFile(e.target.files[0], side, projectId);
  });
}

async function handleSchemaFile(file, side, projectId) {
  try {
    const text = await readFileAsText(file);
    const schema = file.name.endsWith('.csv')
      ? parseCSVTemplate(text, file.name.replace('.csv', ''))
      : parseJSONSchema(text);
    const p = getProject(projectId);
    p[side === 'source' ? 'sourceSchema' : 'targetSchema'] = schema;
    saveProject(p);
    toast(`${side} schema imported`);
    renderSetup({ id: projectId });
  } catch (err) {
    toast(err.message);
  }
}

function renderSchemaPreview(schema, stats) {
  return `
    <div class="alert alert-success" style="margin-top:0.75rem">${stats.tables} tables · ${stats.columns} columns loaded</div>
    <div class="schema-preview"><table>
      <thead><tr><th>Table</th><th>Column</th><th>Type</th></tr></thead>
      <tbody>${schema.tables.flatMap(t => t.columns.slice(0, 8).map(c =>
        `<tr><td>${esc(t.name)}</td><td>${esc(c.name)}</td><td>${esc(c.type)}</td></tr>`
      )).join('')}</tbody>
    </table></div>`;
}

function renderInvite({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();
  const users = getUsers();

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  mount(`
    ${projectSteps(project, 'invite')}
    <div class="page-head"><div><h1>Invite the other party</h1><p>LA, vendor, or consultant — they join this project only.</p></div></div>
    <div class="grid-2">
      <div class="card">
        <form id="invite-form">
          <div class="field"><label>Email address</label><input type="email" name="email" placeholder="colleague@authority.gov.uk" required></div>
          <div class="field"><label>Role</label>
            <select name="role">
              <option value="editor">Editor — can map columns</option>
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
      <a href="#/projects/${id}/map" class="btn btn-secondary">Continue to mapping →</a>
      <a href="#/projects/${id}/verify" class="btn btn-primary" style="margin-left:0.5rem">Test & live →</a>
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
      <div><h1>Mapping workspace</h1><p>Drag from source ● to target ● to create mappings. Click a line to edit rules.</p></div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" id="auto-suggest">Auto-suggest mappings</button>
        <a href="#/projects/${id}/verify" class="btn btn-secondary btn-sm">Test & live →</a>
        <a href="#/projects/${id}/export" class="btn btn-ghost btn-sm">Export</a>
      </div>
    </div>
    <div id="mapping-container"></div>
  `);
  attachLogout();

  const container = document.getElementById('mapping-container');
  canvasInstance = new MappingCanvas(container, {
    sourceSchema: project.sourceSchema,
    targetSchema: project.targetSchema,
    mappings: [...project.mappings],
    getActor: () => getCurrentUser()?.name || 'unknown',
    onChange: mappings => {
      const p = getProject(id);
      p.mappings = mappings;
      p.status = 'mapping';
      saveProject(p);
      const stats = mappingProgress(p.sourceSchema, p.targetSchema, mappings);
      canvasInstance.updateFooter(stats);
    },
    onSelectMapping: mapping => openMappingDrawer(mapping, id),
  });

  const stats = mappingProgress(project.sourceSchema, project.targetSchema, project.mappings);
  project.mappings.forEach(ensureVerification);
  saveProject(project);
  canvasInstance.updateFooter(stats);

  document.getElementById('auto-suggest').addEventListener('click', () => {
    const p = getProject(id);
    for (const s of suggestedMappings) {
      if (!p.mappings.some(m => m.sourceColumn === s.sourceColumn && m.targetColumn === s.targetColumn)) {
        p.mappings.push({
          id: uid(), ...s,
          transformNotes: '', lookupRule: '', defaultValue: '', serviceArea: '',
          verification: defaultVerification('Auto-suggested mapping', getCurrentUser()?.name || 'unknown'),
        });
      }
    }
    saveProject(p);
    toast('Suggested mappings added');
    renderMap({ id });
  });
}

function formatStepNames(t) {
  if (!t?.names?.length) return t?.by || '';
  return t.names.join(', ');
}

function showParticipantModal({ step, teamNames, defaultName, multi }) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'record-modal-backdrop';
    const names = [...new Set([defaultName, ...teamNames].filter(Boolean))];
    const selected = new Set(multi ? [defaultName].filter(Boolean) : [defaultName || names[0] || '']);

    backdrop.innerHTML = `
      <div class="record-modal" role="dialog" aria-modal="true">
        <h3>${multi ? 'Who checked?' : 'Recorded by'}</h3>
        <p class="record-modal-sub">${esc(step.action)}${multi ? ' — select everyone who checked' : ''}</p>
        <div class="record-modal-list">${names.length ? names.map(name => `
          <label class="record-modal-option">
            <input type="${multi ? 'checkbox' : 'radio'}" name="participant" value="${esc(name)}"
              ${selected.has(name) ? 'checked' : ''}${!multi ? '' : ''}>
            <span>${esc(name)}</span>
          </label>`).join('') : '<p class="record-modal-empty">Add names to the migration team below first.</p>'}
        <div class="field" style="margin:0.75rem 0 0">
          <label>${multi ? 'Add someone not listed' : 'Or type a name'}</label>
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
        toast('Select or enter at least one name');
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

function renderProjectSetupCard(project) {
  ensureProjectTeam(project);
  ensureProjectServiceAreas(project);
  const teamNames = getProjectTeamNames(project, getUsers());
  const areas = getProjectServiceAreaNames(project);
  return `
    <div class="card project-setup-card">
      <div class="project-setup-grid">
        <section>
          <h3 style="margin-bottom:0.35rem;font-size:0.95rem">Migration team</h3>
          <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">Everyone who may be recorded on column steps.</p>
          <div class="team-chips">${teamNames.length
            ? teamNames.map(n => `<span class="team-chip">${esc(n)}<button type="button" class="team-chip-remove" data-list="team" data-name="${esc(n)}" aria-label="Remove">×</button></span>`).join('')
            : '<span style="font-size:0.82rem;color:var(--muted)">No names yet.</span>'}</div>
          <form id="team-form" class="team-add-form">
            <input name="name" placeholder="Full name" required>
            <button type="submit" class="btn btn-secondary btn-sm">Add</button>
          </form>
        </section>
        <section>
          <h3 style="margin-bottom:0.35rem;font-size:0.95rem">Service areas</h3>
          <p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">Group columns — e.g. Pupil, Attendance, Staff. Assign per row below.</p>
          <div class="team-chips">${areas.length
            ? areas.map(a => `<span class="team-chip area-chip">${esc(a)}<button type="button" class="team-chip-remove" data-list="area" data-name="${esc(a)}" aria-label="Remove">×</button></span>`).join('')
            : '<span style="font-size:0.82rem;color:var(--muted)">No areas yet.</span>'}</div>
          <form id="area-form" class="team-add-form">
            <input name="name" placeholder="Area name" required>
            <button type="submit" class="btn btn-secondary btn-sm">Add</button>
          </form>
        </section>
      </div>
    </div>`;
}

function bindProjectSetupForms(projectId, onUpdate) {
  document.getElementById('team-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name')?.trim();
    if (!name) return;
    const p = getProject(projectId);
    ensureProjectTeam(p);
    if (!p.team.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      p.team.push({ name });
      saveProject(p);
      toast(`${name} added to team`);
    }
    onUpdate?.();
  });
  document.getElementById('area-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name')?.trim();
    if (!name) return;
    const p = getProject(projectId);
    ensureProjectServiceAreas(p);
    if (!p.serviceAreas.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      p.serviceAreas.push({ name });
      saveProject(p);
      toast(`${name} added`);
    }
    onUpdate?.();
  });
  document.querySelectorAll('.team-chip-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getProject(projectId);
      if (btn.dataset.list === 'area') {
        ensureProjectServiceAreas(p);
        p.serviceAreas = p.serviceAreas.filter(a => a.name !== btn.dataset.name);
      } else {
        ensureProjectTeam(p);
        p.team = p.team.filter(t => t.name !== btn.dataset.name);
      }
      saveProject(p);
      onUpdate?.();
    });
  });
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
  let dashboardOpen = false;

  document.getElementById('app-shell').innerHTML = nav(initial.name) + '<main class="app-main" id="app-main"></main>';

  function render() {
    const panel = document.getElementById('trace-dashboard-panel');
    if (panel?.open) dashboardOpen = true;

    const project = getProject(id);
    ensureProjectTeam(project);
    ensureProjectServiceAreas(project);
    project.mappings.forEach(ensureMappingFields);
    const traceCounts = traceStepSummary(project.mappings);
    const counts = verificationSummary(project.mappings);
    const areaCounts = countByServiceArea(project.mappings);
    const serviceAreas = getProjectServiceAreaNames(project);
    const filtered = filterMappings(project.mappings, {
      traceStep: filterStep,
      phase: filterPhase,
      status: filterStatus,
      serviceArea: filterServiceArea,
    });
    const dashData = buildTraceDashboardData(project.mappings);

    destroyDashboardCharts();
    mount(`
      ${projectSteps(project, 'verify')}
      <div class="alert alert-info">Mapping defines the contract. This page records <strong>delivery & checks</strong> — SQL sent, test upload, verification, live push. Cleaning data happens elsewhere.</div>
      <div class="page-head">
        <div>
          <h1>Test & live verification</h1>
          <p>Click the next tick to record progress. Every change is logged with name and timestamp — including reverts and resends.</p>
        </div>
        <a href="#/projects/${id}/export" class="btn btn-secondary btn-sm">Export log →</a>
      </div>
      ${renderTraceDashboardHTML(dashData, dashboardOpen)}
      ${renderProjectSetupCard(project)}
      ${renderPhaseBar(traceCounts, filterStep)}
      <div class="verification-summary" id="verify-filters">
        <button class="verification-pill ${!filterStep && !filterPhase && !filterStatus && !filterServiceArea ? 'active' : ''}" data-filter-type="all">All <span class="count">${project.mappings.length}</span></button>
        ${serviceAreas.map(area => areaCounts[area] ? `
          <button class="verification-pill ${filterServiceArea === area ? 'active' : ''}" data-filter-type="service-area" data-filter="${esc(area)}">
            ${esc(area)} <span class="count">${areaCounts[area]}</span>
          </button>` : '').join('')}
        ${areaCounts.__unassigned__ ? `
          <button class="verification-pill ${filterServiceArea === '__unassigned__' ? 'active' : ''}" data-filter-type="service-area" data-filter="__unassigned__">
            Unassigned <span class="count">${areaCounts.__unassigned__}</span>
          </button>` : ''}
        ${Object.entries(PHASE_GROUPS).filter(([key]) => key === 'test' || key === 'live').map(([key, group]) => {
          const n = countByPhase(project.mappings, key);
          return `<button class="verification-pill ${filterPhase === key ? 'active' : ''}" data-filter-type="phase" data-filter="${key}">
            ${group.label} <span class="count">${n}</span></button>`;
        }).join('')}
        ${Object.entries(VERIFICATION_STATUSES).map(([key, meta]) => counts[key] ? `
          <button class="verification-pill ${filterStatus === key ? 'active' : ''}" data-filter-type="status" data-filter="${key}" style="border-color:${meta.color}40">
            ${meta.label} <span class="count">${counts[key]}</span>
          </button>` : '').join('')}
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${filtered.length ? `<table class="verification-table">
          <thead><tr>
            <th>Service area</th>
            <th>Column mapping</th>
            <th>Traceability</th>
          </tr></thead>
          <tbody>${filtered.map(m => {
            const phase = statusMeta(m.verification.status).phase;
            const status = m.verification.status;
            const rowClass = [
              phase === 'live' ? 'row-live' : '',
              status === 'live_failed' ? 'row-live-failed' : '',
              status === 'signed_off' ? 'row-done' : '',
            ].filter(Boolean).join(' ');
            return `<tr${rowClass ? ` class="${rowClass}"` : ''} data-mapping-id="${m.id}">
              <td class="col-service-area">
                <select class="service-area-select" data-mapping-id="${m.id}" aria-label="Service area">
                  ${renderServiceAreaOptions(serviceAreas, m.serviceArea || '')}
                </select>
              </td>
              <td class="col-mapping"><code style="font-size:0.75rem">${esc(formatColumnRef(m))}</code></td>
              <td class="col-trace">${renderTraceStrip(m, { interactive: true, mappingId: m.id })}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : `<div class="empty-state" style="padding:2rem">
          <p>No columns in this phase yet.</p>
          <p style="font-size:0.85rem;margin-top:0.5rem">Click the highlighted tick on a row to record the next step.</p>
        </div>`}
      </div>
    `);

    document.querySelectorAll('#verify-filters .verification-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.filterType === 'all') {
          filterStep = null;
          filterPhase = null;
          filterStatus = null;
          filterServiceArea = null;
        } else if (btn.dataset.filterType === 'service-area') {
          filterServiceArea = btn.dataset.filter;
          filterStep = null;
          filterPhase = null;
          filterStatus = null;
        } else if (btn.dataset.filterType === 'phase') {
          filterStep = null;
          filterPhase = btn.dataset.filter;
          filterStatus = null;
          filterServiceArea = null;
        } else {
          filterStatus = btn.dataset.filter;
          filterStep = null;
          filterPhase = null;
          filterServiceArea = null;
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
        render();
      });
    });
    bindProjectSetupForms(id, () => render());
    bindServiceAreaSelects(id, render);
    bindTraceClicks(id, render);
    document.querySelectorAll('.verification-table tr[data-mapping-id] .col-mapping').forEach(cell => {
      cell.addEventListener('click', () => {
        const row = cell.closest('tr');
        const m = getProject(id).mappings.find(x => x.id === row.dataset.mappingId);
        openMappingDrawer(m, id, null, getProject(id));
      });
    });
    document.getElementById('trace-dashboard-panel')?.addEventListener('toggle', e => {
      dashboardOpen = e.target.open;
      if (dashboardOpen) {
        requestAnimationFrame(() => mountDashboardCharts(getProject(id).mappings));
      } else {
        destroyDashboardCharts();
      }
    });
    if (dashboardOpen) {
      requestAnimationFrame(() => mountDashboardCharts(project.mappings));
    }
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
  if (step.checkStep) {
    pass = confirm(`${step.action} — did this pass?\n\nOK = Pass · Cancel = Fail`);
    if (!pass) {
      note = window.prompt('Note required — describe the issue:')?.trim() || '';
      if (!note) {
        toast('Not recorded — note required for failures');
        return;
      }
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

  if (!recordTraceStep(m, stepKey, { by: participants[0], participants, pass, note })) {
    toast('Could not record step');
    return;
  }
  saveProject(p);
  toast(`${step.action} recorded`);
  rerender?.();
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
    return `${step.action} · ${who} · ${new Date(t.at).toLocaleString()}${attemptNote} · Click to go back`;
  }
  if (t && visual === 'failed') {
    return `${step.action} failed · ${who} · ${new Date(t.at).toLocaleString()}${attemptNote} · Click to go back and re-do`;
  }
  if (visual === 'next') return `Click to record: ${step.action}`;
  return `${step.action} — not yet`;
}

function renderTraceStrip(mapping, { interactive = false, mappingId = '' } = {}) {
  const trace = columnTraceability(mapping);
  return `<div class="trace-pipeline">${TRACE_STEPS.map((step, i) => {
    const t = trace[step.key];
    const visual = traceStepVisualState(mapping, step.key);
    const prevVisual = i > 0 ? traceStepVisualState(mapping, TRACE_STEPS[i - 1].key) : null;
    const prevDone = prevVisual === 'done' || prevVisual === 'failed';
    const title = traceNodeTitle(mapping, step, t, visual);
    const connector = i > 0
      ? `<div class="trace-connector ${prevDone ? 'done' : ''}" aria-hidden="true"></div>`
      : '';
    const inner = `
      <div class="trace-node-marker" aria-hidden="true">${visual === 'done' || visual === 'failed' ? (visual === 'failed' ? '!' : '✓') : visual === 'next' ? '+' : ''}</div>
      <div class="trace-node-text">
        <span class="trace-action">${esc(step.action)}</span>
        <span class="trace-person">${t ? esc(formatStepNames(t)) : visual === 'next' ? 'Click to record' : 'Pending'}${t && countStepAttempts(mapping, step.key) > 1 ? ` · ×${countStepAttempts(mapping, step.key)}` : ''}</span>
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
            ? '<div class="trace-meta trace-meta-next">Click the tick to record</div>'
            : '<div class="trace-meta trace-meta-pending">Not yet recorded</div>'}
        ${interactive && canRevertTraceStep(mapping, step.key) ? '<div class="trace-meta trace-meta-revert">Click to go back and re-do</div>' : ''}
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
    return `<button type="button" class="phase-step-btn phase-step ${isActive ? 'current' : ''}" data-phase="${step.key}" title="${esc(step.action)} completed">
      ${step.action}<span class="phase-count">${n}</span>
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

  drawer.classList.add('open');
  backdrop?.classList.add('open');

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-header-top">
        <div>
          <div class="drawer-title">Column</div>
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
      <p class="drawer-hint">Click + to record the next step. Click a completed tick to go back. Every action is kept in the audit log below.</p>
    </div>
    <div class="drawer-body">
      <details class="drawer-section" open>
        <summary>Traceability</summary>
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
                <div class="hist-meta">${esc(h.by)} · ${new Date(h.at).toLocaleString()}</div>
              </li>`;
            }
            const hm = statusMeta(h.status);
            return `<li>
              <div class="hist-status" style="color:${hm.color}">${hm.label}</div>
              ${h.note ? `<div class="hist-note">${esc(h.note)}</div>` : ''}
              <div class="hist-meta">${esc(h.participants?.length ? h.participants.join(', ') : h.by)} · ${new Date(h.at).toLocaleString()}${h.reference ? ` · ${esc(h.reference)}` : ''}</div>
            </li>`;
          }).join('')}</ul>` : `<p style="font-size:0.8rem;color:var(--muted)">No history yet.</p>`}
        </div>
      </details>
    </div>
    <div class="drawer-footer">
      <button class="btn btn-danger btn-sm" id="delete-mapping">Delete mapping</button>
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

  document.getElementById('delete-mapping').onclick = () => {
    if (!confirm('Delete this mapping?')) return;
    if (canvasInstance) canvasInstance.deleteMapping(mapping.id);
    else {
      const p = getProject(projectId);
      p.mappings = p.mappings.filter(x => x.id !== mapping.id);
      saveProject(p);
    }
    closeDrawer();
    toast('Mapping deleted');
    if (location.hash.includes('/verify')) renderVerify({ id: projectId });
  };
}

function renderExport({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();
  const user = getCurrentUser();
  const stats = mappingProgress(project.sourceSchema, project.targetSchema, project.mappings);

  project.mappings.forEach(ensureVerification);
  const vCounts = verificationSummary(project.mappings);

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  mount(`
    ${projectSteps(project, 'export')}
    <div class="page-head"><div><h1>Export & close project</h1><p>Export mapping spec and column-level verification log, then permanently delete project data.</p></div></div>
    <div class="card" style="margin-bottom:1rem">
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:1rem">${stats.mappedCount} mappings · ${stats.percent}% target columns mapped · ${vCounts.signed_off || 0} columns signed off</p>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Export</h3>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <button class="btn btn-primary btn-sm" id="export-json">Download JSON package</button>
          <button class="btn btn-secondary btn-sm" id="export-csv">Download CSV</button>
          <button class="btn btn-secondary btn-sm" id="export-xlsx">Download Excel (mappings + log)</button>
          <button class="btn btn-ghost btn-sm" id="export-sql">Download SQL stubs</button>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:0.75rem;color:var(--danger)">Close & delete project</h3>
        <p style="font-size:0.88rem;color:var(--muted);margin-bottom:1rem">All schemas, mappings, credentials and comments are permanently deleted. You keep only what you exported.</p>
        <button class="btn btn-danger" id="close-project">Close project & wipe data</button>
      </div>
    </div>
  `);
  attachLogout();

  document.getElementById('export-json').onclick = () => {
    downloadJSON(buildExportPackage(project, user), `${slug(project.name)}-mapping.json`);
    toast('JSON exported');
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
    toast('SQL stubs exported');
  };
  document.getElementById('close-project').onclick = () => {
    if (!confirm('Permanently delete all project data? This cannot be undone.')) return;
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
