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
  buildExportPackage, downloadJSON, downloadCSV, downloadExcel, generateSQLStubs,
} from './export.js';
import { MappingCanvas } from './mapping.js';

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
      <a href="#/projects/${id}/map" class="btn btn-primary">Continue to mapping →</a>
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
        <a href="#/projects/${id}/export" class="btn btn-secondary btn-sm">Export →</a>
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
  canvasInstance.updateFooter(stats);

  document.getElementById('auto-suggest').addEventListener('click', () => {
    const p = getProject(id);
    for (const s of suggestedMappings) {
      if (!p.mappings.some(m => m.sourceColumn === s.sourceColumn && m.targetColumn === s.targetColumn)) {
        p.mappings.push({ id: uid(), ...s, transformNotes: '', lookupRule: '', defaultValue: '' });
      }
    }
    saveProject(p);
    toast('Suggested mappings added');
    renderMap({ id });
  });
}

function openMappingDrawer(mapping, projectId) {
  const drawer = document.getElementById('mapping-drawer');
  if (!mapping) {
    drawer.classList.remove('open');
    return;
  }
  drawer.classList.add('open');
  drawer.innerHTML = `
    <button class="drawer-close" id="close-drawer">×</button>
    <h3>Mapping rule</h3>
    <p style="font-size:0.85rem;color:var(--muted);margin-bottom:1rem;font-family:monospace">
      ${esc(mapping.sourceTable)}.${esc(mapping.sourceColumn)} → ${esc(mapping.targetTable)}.${esc(mapping.targetColumn)}
    </p>
    <div class="field"><label>Transform notes</label><textarea id="transform-notes">${esc(mapping.transformNotes || '')}</textarea></div>
    <div class="field"><label>Lookup conversion rule</label><textarea id="lookup-rule" placeholder="e.g. Synergy FSM code 1 → Impulse FSM_ACTIVE">${esc(mapping.lookupRule || '')}</textarea></div>
    <div class="field"><label>Default value</label><input id="default-value" value="${esc(mapping.defaultValue || '')}"></div>
    <div style="display:flex;gap:0.5rem;margin-top:1rem">
      <button class="btn btn-primary btn-sm" id="save-mapping">Save</button>
      <button class="btn btn-danger btn-sm" id="delete-mapping">Delete mapping</button>
    </div>
  `;

  document.getElementById('close-drawer').onclick = () => drawer.classList.remove('open');
  document.getElementById('save-mapping').onclick = () => {
    canvasInstance.updateMapping(mapping.id, {
      transformNotes: document.getElementById('transform-notes').value,
      lookupRule: document.getElementById('lookup-rule').value,
      defaultValue: document.getElementById('default-value').value,
    });
    const p = getProject(projectId);
    p.mappings = canvasInstance.mappings;
    saveProject(p);
    toast('Mapping saved');
  };
  document.getElementById('delete-mapping').onclick = () => {
    canvasInstance.deleteMapping(mapping.id);
    const p = getProject(projectId);
    p.mappings = canvasInstance.mappings;
    saveProject(p);
    drawer.classList.remove('open');
    toast('Mapping deleted');
  };
}

function renderExport({ id }) {
  const project = getProject(id);
  if (!project) return renderNotFound();
  const user = getCurrentUser();
  const stats = mappingProgress(project.sourceSchema, project.targetSchema, project.mappings);

  document.getElementById('app-shell').innerHTML = nav(project.name) + '<main class="app-main" id="app-main"></main>';
  mount(`
    ${projectSteps(project, 'export')}
    <div class="page-head"><div><h1>Export & close project</h1><p>Download your mapping artefact, then permanently delete all project data.</p></div></div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Export mapping</h3>
        <p style="font-size:0.88rem;color:var(--muted);margin-bottom:1rem">${stats.mappedCount} mappings · ${stats.percent}% of target columns mapped</p>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <button class="btn btn-primary btn-sm" id="export-json">Download JSON package</button>
          <button class="btn btn-secondary btn-sm" id="export-csv">Download CSV</button>
          <button class="btn btn-secondary btn-sm" id="export-xlsx">Download Excel</button>
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
    downloadCSV(project.mappings.map(m => ({
      source_table: m.sourceTable, source_column: m.sourceColumn,
      target_table: m.targetTable, target_column: m.targetColumn,
      transform_notes: m.transformNotes, lookup_rule: m.lookupRule, default_value: m.defaultValue,
    })), `${slug(project.name)}-mapping.csv`);
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
