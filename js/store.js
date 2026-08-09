const KEYS = {
  users: 'mapbridge_users',
  session: 'mapbridge_session',
  projects: 'mapbridge_projects',
  invites: 'mapbridge_invites',
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return crypto.randomUUID();
}

export function getUsers() {
  return read(KEYS.users) || [];
}

export function saveUser(user) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  write(KEYS.users, users);
  return user;
}

export function findUserByEmail(email) {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

export function getSession() {
  return read(KEYS.session);
}

export function setSession(userId) {
  write(KEYS.session, { userId });
}

export function clearSession() {
  localStorage.removeItem(KEYS.session);
}

export function getProjects() {
  return read(KEYS.projects) || [];
}

export function getProject(id) {
  return getProjects().find(p => p.id === id) || null;
}

export function saveProject(project) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project;
  else projects.push(project);
  write(KEYS.projects, projects);
  return project;
}

export function deleteProject(id) {
  write(KEYS.projects, getProjects().filter(p => p.id !== id));
}

export function getInvites() {
  return read(KEYS.invites) || [];
}

export function saveInvite(invite) {
  const invites = getInvites();
  invites.push(invite);
  write(KEYS.invites, invites);
  return invite;
}

export function getInviteByToken(token) {
  return getInvites().find(i => i.token === token) || null;
}

export function removeInvite(token) {
  write(KEYS.invites, getInvites().filter(i => i.token !== token));
}

export function createProject({ name, sourceSystem, targetSystem, ownerId }) {
  return saveProject({
    id: uid(),
    name,
    sourceSystem,
    targetSystem,
    ownerId,
    members: [{ userId: ownerId, role: 'owner', status: 'active' }],
    sourceSchema: null,
    targetSchema: null,
    mappings: [],
    status: 'setup',
    createdAt: new Date().toISOString(),
  });
}

export function addMember(projectId, userId, role = 'editor') {
  const project = getProject(projectId);
  if (!project) return null;
  if (!project.members.find(m => m.userId === userId)) {
    project.members.push({ userId, role, status: 'active' });
    saveProject(project);
  }
  return project;
}

export { uid };
