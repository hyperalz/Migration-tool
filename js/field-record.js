// The field record: what happened to every field, including the ones that
// did not move. Three things live here, all append-only, so nothing that was
// decided is ever lost:
//
// - removed matches: a match that is deleted, replaced or dropped is kept
//   with who removed it, when and why, along with its full history;
// - field decisions: an old field with no match can be recorded as "not
//   moving", with a reason. Changing your mind adds an entry; it does not
//   erase the first one;
// - field search: one question, "where did this field go, and why?",
//   answered from the matches, the decisions and the removals together.
//
// Pure functions, so they can be tested.

import { statusMeta, ensureVerification } from './verification.js';

export const RECORD_TEXT = {
  removeTitle: 'Remove this match',
  removeHint: 'The match and its history stay in the record, with your reason. It no longer counts as a match.',
  reasonLabel: 'Why are you removing it?',
  reasonNeeded: 'Enter a reason',
  removeConfirm: 'Remove match',
  removed: 'Match removed. It stays in the record.',
  replaced: 'Replaced by a new match for the same field',
  droppedFromList: 'The field is no longer in the field list',
  notMovingTitle: 'Old fields with no match',
  notMovingLead: 'Record a decision for each one, so the evidence shows what was left behind and why.',
  notMoving: 'Not moving',
  notMovingReason: 'Why is it not moving?',
  notMovingSave: 'Record decision',
  undecided: 'No decision yet',
  undo: 'Change decision',
  undone: 'Decision withdrawn',
  allDecided: 'Every old field is either matched or has a decision.',
  searchTitle: 'Find a field',
  searchLabel: 'Field name',
  searchHint: 'Type part of an old or new field name to see where it went, and why.',
  noResults: 'No field matches that name.',
};

const now = () => new Date().toISOString();
const clean = s => String(s ?? '').trim();
const key = (table, column) => `${table}␟${column}`;

/** Keep a copy of a match that is being removed, with who, when and why. */
export function retireMatch(project, mapping, { by, reason, kind = 'removed', at = now() }) {
  if (!mapping) return null;
  project.removedMatches = project.removedMatches || [];
  if (project.removedMatches.some(r => r.id === mapping.id)) return null;
  const copy = JSON.parse(JSON.stringify(mapping));
  ensureVerification(copy);
  copy.verification.history.push({ status: 'removed', at, by: by || 'unknown', note: clean(reason), reference: '' });
  copy.removed = { at, by: by || 'unknown', reason: clean(reason), kind };
  project.removedMatches.push(copy);
  return copy;
}

/**
 * Compare the matches before and after a change, and keep any that went
 * without being removed on purpose (for example, a new match replaced them).
 */
export function retireMissing(project, before, after, { by, reason = RECORD_TEXT.replaced, kind = 'replaced', at = now() } = {}) {
  const still = new Set((after || []).map(m => m.id));
  return (before || [])
    .filter(m => !still.has(m.id))
    .map(m => retireMatch(project, m, { by, reason, kind, at }))
    .filter(Boolean);
}

// ---- Decisions for old fields with no match ----

/** Record that an old field is not moving, with a reason. */
export function recordNotMoving(project, { table, column, reason, by, at = now() }) {
  if (!clean(reason)) throw new Error(RECORD_TEXT.reasonNeeded);
  project.fieldDecisions = project.fieldDecisions || [];
  const entry = { side: 'old', table, column, decision: 'not_moving', reason: clean(reason), by: by || 'unknown', at };
  project.fieldDecisions.push(entry);
  return entry;
}

/** Withdraw a decision. The original stays in the record. */
export function withdrawDecision(project, { table, column, by, at = now() }) {
  project.fieldDecisions = project.fieldDecisions || [];
  const entry = { side: 'old', table, column, decision: 'withdrawn', reason: '', by: by || 'unknown', at };
  project.fieldDecisions.push(entry);
  return entry;
}

/** The latest decision for an old field, or null if none stands. */
export function currentDecision(project, table, column) {
  const entries = (project.fieldDecisions || []).filter(d => d.table === table && d.column === column);
  const last = entries[entries.length - 1];
  return last && last.decision === 'not_moving' ? last : null;
}

/** Every old field with no match, and whether a decision has been recorded. */
export function unmatchedOldFields(project) {
  const matched = new Set((project.mappings || []).map(m => key(m.sourceTable, m.sourceColumn)));
  const out = [];
  for (const t of project.sourceSchema?.tables || []) {
    for (const c of t.columns || []) {
      if (matched.has(key(t.name, c.name))) continue;
      out.push({ table: t.name, column: c.name, decision: currentDecision(project, t.name, c.name) });
    }
  }
  return out;
}

export function decisionSummary(project) {
  const list = unmatchedOldFields(project);
  const decided = list.filter(f => f.decision).length;
  return { unmatched: list.length, decided, undecided: list.length - decided };
}

// ---- Find a field ----

const ruleText = m => [m.lookupRule && `Translation: ${m.lookupRule}`, m.defaultValue && `Default: ${m.defaultValue}`, m.transformNotes && `Note: ${m.transformNotes}`]
  .filter(Boolean).join(' · ');

/**
 * Answer "where did this field go, and why?" for every old or new field whose
 * name contains the query. Results say what happened: matched (with where,
 * the rules and the current step), not moving (with the reason), no decision
 * yet, or removed (with who and why).
 */
export function findFields(project, query, { limit = 25 } = {}) {
  const q = clean(query).toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  const removedFor = (side, table, column) => (project.removedMatches || []).filter(r =>
    side === 'old' ? r.sourceTable === table && r.sourceColumn === column : r.targetTable === table && r.targetColumn === column);

  for (const [side, schema] of [['old', project.sourceSchema], ['new', project.targetSchema]]) {
    for (const t of schema?.tables || []) {
      for (const c of t.columns || []) {
        if (!`${t.name}.${c.name}`.toLowerCase().includes(q) && !String(c.description || '').toLowerCase().includes(q)) continue;
        const matches = (project.mappings || []).filter(m => side === 'old'
          ? m.sourceTable === t.name && m.sourceColumn === c.name
          : m.targetTable === t.name && m.targetColumn === c.name);
        const removed = removedFor(side, t.name, c.name).map(r => ({
          to: side === 'old' ? `${r.targetTable}.${r.targetColumn}` : `${r.sourceTable}.${r.sourceColumn}`,
          by: r.removed.by, at: r.removed.at, reason: r.removed.reason,
        }));
        let state; let detail = '';
        if (matches.length) {
          state = 'matched';
        } else if (side === 'old' && currentDecision(project, t.name, c.name)) {
          state = 'not_moving';
          const d = currentDecision(project, t.name, c.name);
          detail = d.reason;
        } else {
          state = side === 'old' ? 'undecided' : 'unmatched';
        }
        hits.push({
          side, table: t.name, column: c.name, state, detail,
          decision: side === 'old' ? currentDecision(project, t.name, c.name) : null,
          matches: matches.map(m => ({
            id: m.id,
            to: side === 'old' ? `${m.targetTable}.${m.targetColumn}` : `${m.sourceTable}.${m.sourceColumn}`,
            rules: ruleText(m),
            step: statusMeta(m.verification?.status).label,
            area: m.serviceArea || '',
          })),
          removed,
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

/** One line saying what happened to a search result. */
export function resultLine(hit) {
  if (hit.state === 'matched') {
    return hit.matches.map(m => `${hit.side === 'old' ? 'Goes to' : 'Comes from'} ${m.to}. ${m.step}.${m.rules ? ` ${m.rules}.` : ''}`).join(' ');
  }
  if (hit.state === 'not_moving') return `Not moving: ${hit.detail}`;
  if (hit.state === 'undecided') return 'No match, and no decision yet.';
  return 'Nothing from the old system goes here yet.';
}
