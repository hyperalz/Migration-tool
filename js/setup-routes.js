// Set up: the ways to get a list of fields for each system.
// The old and new systems have different ways in: pictures of screens only
// make sense for the old system, and the supplier's mapping spreadsheet
// usually describes the new one. Pure functions, so they can be tested.

import { screenTables } from './trace.js';

export const SETUP_TEXT = {
  title: 'Set up: get a list of fields from each system',
  lead: 'MapBridge matches the two lists in the next step. The better the lists, the better the matches.',
  noRecords: 'You only need the names of the fields and what they hold, never real records about people.',
  question: side => `Where will the ${side} system's list come from?`,
  change: 'Use a different way',
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
  ],
  new: [
    { key: 'supplier', title: "Import the supplier's mapping spreadsheet", best: 'When the supplier has sent their templates.',
      gives: "The new system's fields, its areas, and any matches the supplier has already made." },
    { key: 'db', title: 'Connect to its test database', best: 'When the supplier gives you access to a test system.',
      gives: 'Every table and field, with types, from a read-only connector.' },
    { key: 'file', title: 'Upload a field list', best: 'When you have a list in any other form.',
      gives: 'The fields in your file, with any definitions and values you wrote down.' },
  ],
};

export const SIDE_WORD = { old: 'old', new: 'new' };
const SCHEMA_KEY = { old: 'sourceSchema', new: 'targetSchema' };
const ORIGIN_KEY = { old: 'sourceOrigin', new: 'targetOrigin' };

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
  const from = {
    db: 'from its database',
    file: 'from a file',
    screens: 'from pictures of its screens',
    supplier: "from the supplier's spreadsheet",
    sample: 'from a sample list',
  }[listOrigin(project, side)] || '';
  const alsoSupplier = side === 'old' && listOrigin(project, side) !== 'supplier' && project.templateImport?.added?.sourceFields
    ? " and the supplier's spreadsheet" : '';
  return `${fields.toLocaleString('en-GB')} ${fields === 1 ? 'field' : 'fields'} in ${tables} ${tables === 1 ? 'table' : 'tables'}${from ? `, ${from}${alsoSupplier}` : ''}`;
}
