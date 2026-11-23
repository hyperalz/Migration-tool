// Set up: the ways to get a list of fields for each system.
// The old and new systems have different ways in: pictures of screens only
// make sense for the old system, and the supplier's mapping spreadsheet
// usually describes the new one. Pure functions, so they can be tested.

import { screenTables } from './trace.js';
import { PROFILE_TEXT } from './system-profiles.js';

const READY = { key: 'profile', title: PROFILE_TEXT.routeTitle, best: PROFILE_TEXT.routeBest, gives: PROFILE_TEXT.routeGives };

export const SETUP_TEXT = {
  title: 'Set up: get a list of fields from each system',
  lead: 'MapBridge matches the two lists in the next step. The better the lists, the better the matches.',
  noRecords: 'You only need the names of the fields and what they hold, never real records about people.',
  question: side => `Where will the ${side} system's list come from?`,
  addMore: 'Add more fields',
  replace: 'Replace this list',
  keep: 'Cancel',
  questionMore: side => `Where are the extra ${side} system fields coming from?`,
  questionReplace: side => `Where will the new ${side} system list come from?`,
  addNote: 'Fields already in the list are kept. New fields are added, and any blank definitions or values are filled in.',
  replaceWarn: (n, side) => n
    ? `${n} ${n === 1 ? 'match uses' : 'matches use'} fields from this list. The ${side} system's list is replaced when you add the new one. Matches to fields that are not in the new list will need matching again.`
    : `The ${side} system's list is replaced when you add the new one. Nothing changes until then.`,
  replaceConfirm: 'Yes, replace it',
  bothReady: 'Both lists are in. Next, match the old fields to the new ones.',
  next: 'Next: match the two lists',
  oneMissing: side => `Add the ${side} system's list to start matching.`,
};

/**
 * The ways in, per side, best first. `best` says when to pick it;
 * `gives` says what you end up with.
 */
export const ROUTES = {
  old: [
    { key: 'db', title: 'Connect to its database', best: 'Best when you can still reach it. The most complete list.',
      gives: 'Every table and field, with types, from a read-only connector your IT team runs once.' },
    { key: 'file', title: 'Upload a field list', best: 'When you already have a list, or an export with headings.',
      gives: 'The fields in your file, with any definitions and values you wrote down.' },
    { key: 'screens', title: 'Use pictures of its screens', best: 'When access has ended, or is about to.',
      gives: 'The names shown on each screen. You can then link them to the real fields.' },
    READY,
  ],
  new: [
    { key: 'supplier', title: "Import the supplier's mapping spreadsheet", best: 'When the supplier has sent their templates.',
      gives: "The new system's fields, its areas, and any matches the supplier has already made." },
    { key: 'db', title: 'Connect to its test database', best: 'When the supplier gives you access to a test system.',
      gives: 'Every table and field, with types, from a read-only connector.' },
    { key: 'file', title: 'Upload a field list', best: 'When you have a list in any other form.',
      gives: 'The fields in your file, with any definitions and values you wrote down.' },
    READY,
  ],
};

export const SIDE_WORD = { old: 'old', new: 'new' };
const SCHEMA_KEY = { old: 'sourceSchema', new: 'targetSchema' };
const ORIGIN_KEY = { old: 'sourceOrigin', new: 'targetOrigin' };
const ORIGINS_KEY = { old: 'sourceOrigins', new: 'targetOrigins' };
const FROM = {
  db: 'its database',
  file: 'a file',
  screens: 'pictures of its screens',
  supplier: "the supplier's spreadsheet",
  sample: 'a sample list',
  profile: 'a ready field list',
};

/** Every place a side's list came from, first one first. */
export function listOrigins(project, side) {
  const first = listOrigin(project, side);
  if (!first) return [];
  const all = [first, ...(project[ORIGINS_KEY[side]] || [])];
  if (side === 'old' && project.templateImport?.added?.sourceFields) all.push('supplier');
  if (side === 'old' && screenTables(project.sourceSchema).length) all.push('screens');
  return [...new Set(all)].filter(o => FROM[o]);
}

/**
 * Record where a list came from. Adding keeps the earlier sources;
 * replacing starts again.
 */
export function recordOrigin(project, side, origin, mode) {
  if (mode === 'add' && project[ORIGIN_KEY[side]]) {
    const extra = new Set(project[ORIGINS_KEY[side]] || []);
    if (origin !== project[ORIGIN_KEY[side]]) extra.add(origin);
    project[ORIGINS_KEY[side]] = [...extra];
  } else {
    project[ORIGIN_KEY[side]] = origin;
    delete project[ORIGINS_KEY[side]];
  }
}

/** Matches that use a field on this side. */
export function matchesUsing(project, side) {
  return (project?.mappings || []).filter(m => side === 'old' ? m.sourceTable && m.sourceColumn : m.targetTable && m.targetColumn).length;
}

/** Matches whose field on this side is no longer in the list. */
export function orphanMatches(project, side) {
  const schema = project?.[SCHEMA_KEY[side]];
  if (!schema?.tables) return [];
  const have = new Set(schema.tables.flatMap(t => (t.columns || []).map(c => `${t.name}\u241f${c.name}`)));
  return (project.mappings || []).filter(m => {
    const [t, c] = side === 'old' ? [m.sourceTable, m.sourceColumn] : [m.targetTable, m.targetColumn];
    return t && c && !have.has(`${t}\u241f${c}`);
  });
}

/** What adding a list did, in plain words. */
export function addResultText({ added = 0, filled = 0, kept = 0 }) {
  const parts = [`Added ${added} ${added === 1 ? 'field' : 'fields'}`];
  if (filled) parts.push(`filled in details for ${filled}`);
  if (kept) parts.push(`${kept} ${kept === 1 ? 'was' : 'were'} already in the list`);
  return parts.join('; ') + '.';
}

export function routeFor(side, key) {
  return ROUTES[side].find(r => r.key === key) || null;
}

/** Where a side's current list came from, if it has one. */
export function listOrigin(project, side) {
  const schema = project?.[SCHEMA_KEY[side]];
  if (!schema?.tables?.length) return null;
  const stored = project[ORIGIN_KEY[side]];
  if (stored && routeFor(side, stored)) return stored;
  if (stored === 'sample') return 'sample';
  if (side === 'old' && screenTables(schema).length) return 'screens';
  if (side === 'old' && project.templateImport?.added?.sourceFields) return 'supplier';
  if (side === 'new' && project.templateImport) return 'supplier';
  return 'file';
}

/**
 * The way in to show open for a side: the one the person picked, else the
 * one their list came from, else the one their start answers point to.
 * Returns null when nothing is chosen yet, so all the options are shown.
 */
export function chosenRoute(project, side) {
  const picked = project?.setupRoutes?.[side];
  if (picked && routeFor(side, picked)) return picked;
  const origin = listOrigin(project, side);
  if (origin && routeFor(side, origin)) return origin;
  const r = project?.route || {};
  if (side === 'old' && r.oldSystemOpen === false) return 'screens';
  if (side === 'new' && r.supplierSheet === true) return 'supplier';
  return null;
}

/**
 * Picking a way in also answers the start questions, so Project settings
 * stays in step with what the person did.
 */
export function answersFromChoice(route, side, key) {
  const next = { ...(route || {}) };
  if (side === 'old') {
    if (key === 'screens') next.oldSystemOpen = false;
    else next.oldSystemOpen = true;
    if (key === 'db') next.oldDatabase = true;
  }
  if (side === 'new') {
    if (key === 'supplier') next.supplierSheet = true;
  }
  return next;
}

/** A short line saying what is in a side's list and where it came from. */
export function originLine(project, side) {
  const schema = project?.[SCHEMA_KEY[side]];
  if (!schema?.tables?.length) return '';
  const fields = schema.tables.reduce((n, t) => n + (t.columns?.length || 0), 0);
  const tables = schema.tables.length;
  const froms = listOrigins(project, side).map(o => FROM[o]);
  const from = froms.length > 1 ? `${froms.slice(0, -1).join(', ')} and ${froms.at(-1)}` : froms[0];
  return `${fields.toLocaleString('en-GB')} ${fields === 1 ? 'field' : 'fields'} in ${tables} ${tables === 1 ? 'table' : 'tables'}${from ? `, from ${from}` : ''}`;
}
