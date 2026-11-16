// Project settings: the few things about a move that people set once and
// may change later — names, the start answers, areas and who manages each,
// and the people who record steps. Plain changes to the project record,
// so they can be tested. The page itself is in settings-view.js.

import { NO_AREA } from './reconcile-overview.js';
import { areaBoard } from './work-queue.js';

export const SETTINGS_TEXT = {
  lead: 'Everything about this move that you set once and may change later.',
  names: 'The names you give the two systems are used on every screen.',
  areas: 'Each area has a service area manager. They sign off the area once live is correct.',
  people: 'Everyone whose name may be recorded against a step.',
  ai: 'MapBridge can suggest matches and read screenshots. These settings are kept in this browser only.',
  inUse: 'This area has fields, so it cannot be removed.',
};

const clean = v => String(v ?? '').trim();

/** Change the project's name and the two systems' names. Blank names are left as they were. */
export function setNames(project, { name, oldName, newName }) {
  if (clean(name)) project.name = clean(name);
  project.sourceSystem = clean(oldName);
  project.targetSystem = clean(newName);
  return project;
}

const areaList = project => (project.serviceAreas || []).map(a => (typeof a === 'string' ? { name: a } : a));

/**
 * Every area in the move, with its manager and how many fields it has:
 * the areas people added here, and those that came from the spreadsheet
 * or from matches.
 */
export function areaRows(project) {
  const saved = areaList(project);
  const board = areaBoard(project);
  const names = [...new Set([...saved.map(a => a.name), ...board.map(r => r.name)])].filter(n => n && n !== NO_AREA);
  return names.sort((a, b) => a.localeCompare(b)).map(name => {
    const row = board.find(r => r.name === name);
    const fields = row ? Math.max(row.counts.fields, row.counts.stages.total) : 0;
    return { name, manager: saved.find(a => a.name === name)?.manager || '', fields, removable: fields === 0 };
  });
}

/** The service area manager for an area, or '' if none is set. */
export function areaManager(project, name) {
  return areaList(project).find(a => a.name === name)?.manager || '';
}

export function setAreaManager(project, name, manager) {
  const list = areaList(project);
  let a = list.find(x => x.name === name);
  if (!a) { a = { name }; list.push(a); }
  a.manager = clean(manager);
  project.serviceAreas = list;
  return project;
}

export function addArea(project, name) {
  const n = clean(name);
  const list = areaList(project);
  if (!n || list.some(a => a.name.toLowerCase() === n.toLowerCase())) return false;
  list.push({ name: n });
  project.serviceAreas = list;
  return true;
}

/** Only an area with no fields can be removed, so nothing is lost. */
export function removeArea(project, name) {
  const row = areaRows(project).find(r => r.name === name);
  if (row && !row.removable) return false;
  project.serviceAreas = areaList(project).filter(a => a.name !== name);
  return true;
}

export function addPerson(project, name) {
  const n = clean(name);
  project.team = project.team || [];
  if (!n || project.team.some(t => t.name.toLowerCase() === n.toLowerCase())) return false;
  project.team.push({ name: n });
  return true;
}

export function removePerson(project, name) {
  project.team = (project.team || []).filter(t => t.name !== name);
  return project;
}

/** The AI settings in plain words. */
export function aiSummary(settings) {
  if (!settings || settings.mode !== 'llm') {
    return settings?.apiKey || /localhost|127\.0\.0\.1/.test(settings?.baseURL || '')
      ? `Matches are suggested by built-in rules. Screenshots are read by ${settings.model || 'the AI service'}.`
      : 'Matches are suggested by built-in rules. No AI service is set up.';
  }
  return `Matches are suggested by ${settings.model || 'the AI service'}. Screenshots are read by it too.`;
}
