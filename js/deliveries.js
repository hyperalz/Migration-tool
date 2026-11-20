// Supplier deliveries: field lists rarely arrive at once. Tables come in
// over weeks, and a table is often sent again with changes. This compares
// what arrives with what is there, applies it the way the person chooses,
// and keeps a log of what came in when. Pure functions, so they can be tested.

const DETAIL_KEYS = ['type', 'description', 'values'];

export const DELIVERY_TEXT = {
  reviewTitle: 'Some tables came in again with changes',
  reviewLead: 'Choose which version to keep for each one. New tables and new fields are added either way.',
  useNew: 'Use the new version',
  keepCurrent: 'Keep the current one and add only new fields',
  apply: 'Add this delivery',
  cancel: 'Cancel',
  logTitle: 'What has come in',
  logLead: 'Every list or table added to this project, newest first.',
  expectTitle: 'Tables still to come',
  expectLead: 'List the tables you are waiting for, one per line. Each is ticked off when it arrives.',
  waiting: n => `Waiting for ${n} ${n === 1 ? 'table' : 'tables'} still to come.`,
};

const norm = v => String(v ?? '').trim();

/** How one incoming table differs from the one already in the list. */
export function compareTable(existing, incoming) {
  if (!existing) return { name: incoming.name, status: 'new', added: (incoming.columns || []).map(c => c.name), removed: [], changed: [] };
  const have = new Map((existing.columns || []).map(c => [c.name, c]));
  const got = new Map((incoming.columns || []).map(c => [c.name, c]));
  const added = [...got.keys()].filter(n => !have.has(n));
  const removed = [...have.keys()].filter(n => !got.has(n));
  const changed = [];
  for (const [name, col] of got) {
    const old = have.get(name);
    if (!old) continue;
    // Only a real difference counts: a blank on either side is filled in, not changed.
    const what = DETAIL_KEYS.filter(k => norm(old[k]) && norm(col[k]) && norm(old[k]) !== norm(col[k]));
    if (what.length) changed.push({ name, what, before: Object.fromEntries(what.map(k => [k, old[k]])), after: Object.fromEntries(what.map(k => [k, col[k]])) });
  }
  const status = !added.length && !removed.length && !changed.length ? 'same' : 'changed';
  return { name: incoming.name, status, added, removed, changed };
}

/** Every incoming table compared with the list as it stands. */
export function compareDelivery(existingSchema, incomingSchema) {
  const byName = new Map((existingSchema?.tables || []).map(t => [t.name, t]));
  return (incomingSchema?.tables || []).map(t => compareTable(byName.get(t.name), t));
}

/** Tables that came in again with fields removed or details changed: these need a choice. */
export function needsReview(comparison) {
  return comparison.filter(c => c.status === 'changed' && (c.removed.length || c.changed.length));
}

/**
 * Add a delivery to a list.
 * - New tables are added.
 * - A changed table in `useNewVersion` takes the supplier's version: fields
 *   no longer sent are dropped, changed details are taken. Anything MapBridge
 *   added to a field (a link to a real field, say) is kept.
 * - Any other table keeps what it has: new fields are added and blanks filled.
 * @returns {{ schema, comparison, summary: { newTables, updatedTables, unchangedTables, addedFields, removedFields, changedFields } }}
 */
export function applyDelivery(existingSchema, incomingSchema, { useNewVersion = new Set(), at = new Date().toISOString() } = {}) {
  const comparison = compareDelivery(existingSchema, incomingSchema);
  const out = { ...(existingSchema || {}), system: existingSchema?.system || incomingSchema?.system || '', tables: (existingSchema?.tables || []).map(t => ({ ...t, columns: [...(t.columns || [])] })) };
  const summary = { newTables: 0, updatedTables: 0, unchangedTables: 0, addedFields: 0, removedFields: 0, changedFields: 0 };
  for (const inc of incomingSchema?.tables || []) {
    const cmp = comparison.find(c => c.name === inc.name);
    const idx = out.tables.findIndex(t => t.name === inc.name);
    if (cmp.status === 'new') {
      out.tables.push({ ...inc, columns: [...(inc.columns || [])], addedAt: at });
      summary.newTables++; summary.addedFields += cmp.added.length;
      continue;
    }
    if (cmp.status === 'same') {
      // Still fill any blanks the new copy has.
      out.tables[idx] = fillBlanks(out.tables[idx], inc);
      summary.unchangedTables++;
      continue;
    }
    const current = out.tables[idx];
    if (useNewVersion.has(inc.name)) {
      const old = new Map(current.columns.map(c => [c.name, c]));
      out.tables[idx] = {
        ...current, ...inc,
        columns: inc.columns.map(c => ({ ...(old.get(c.name) || {}), ...c })),
        updatedAt: at,
      };
      summary.removedFields += cmp.removed.length;
      summary.changedFields += cmp.changed.length;
    } else {
      const merged = fillBlanks(current, inc);
      for (const name of cmp.added) merged.columns.push(inc.columns.find(c => c.name === name));
      out.tables[idx] = { ...merged, updatedAt: cmp.added.length ? at : current.updatedAt };
    }
    summary.updatedTables++; summary.addedFields += cmp.added.length;
  }
  return { schema: out, comparison, summary };
}

function fillBlanks(table, incoming) {
  const inc = new Map((incoming.columns || []).map(c => [c.name, c]));
  return {
    ...table,
    columns: table.columns.map(c => {
      const n = inc.get(c.name);
      if (!n) return c;
      const fill = {};
      for (const k of DETAIL_KEYS) if (!norm(c[k]) && norm(n[k])) fill[k] = n[k];
      return Object.keys(fill).length ? { ...c, ...fill } : c;
    }),
  };
}

/** One line for the log, and the record kept with the project. */
export function deliveryRecord({ side, origin, file, at, by, comparison, useNewVersion = new Set(), replaced = false }) {
  return {
    id: `d${Date.parse(at) || Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    side, origin, file: file || '', at, by: by || '', replaced,
    tables: comparison.map(c => ({
      name: c.name,
      status: c.status === 'changed' ? (useNewVersion.has(c.name) ? 'updated' : 'kept') : c.status,
      added: c.added.length, removed: useNewVersion.has(c.name) ? c.removed.length : 0, changed: useNewVersion.has(c.name) ? c.changed.length : 0,
    })),
  };
}

export function deliverySummaryText(record) {
  const count = s => record.tables.filter(t => t.status === s).length;
  const parts = [];
  const n = count('new'); const u = count('updated'); const k = count('kept'); const same = count('same');
  if (n) parts.push(`${n} new ${n === 1 ? 'table' : 'tables'}`);
  if (u) parts.push(`${u} updated to the new version`);
  if (k) parts.push(`${k} kept as ${k === 1 ? 'it was' : 'they were'}, with new fields added`);
  if (same) parts.push(`${same} unchanged`);
  return parts.join(', ') || 'Nothing new';
}

/** Tables to show as new on the Match screen: those added or changed by the latest delivery on that side. */
export function recentTables(project, side) {
  const mine = (project?.deliveries || []).filter(d => d.side === side);
  const latest = mine.at(-1);
  // The first list for a side, or a replacement, is not "new": everything in it would be.
  if (!latest || mine.length < 2 || latest.replaced) return new Set();
  return new Set(latest.tables.filter(t => t.status === 'new' || t.status === 'updated' || (t.status === 'kept' && t.added)).map(t => t.name));
}

/** The expected tables not yet in the list. Names match ignoring case and spaces. */
export function stillExpected(project) {
  const key = s => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const have = {
    old: new Set((project?.sourceSchema?.tables || []).map(t => key(t.name))),
    new: new Set((project?.targetSchema?.tables || []).map(t => key(t.name))),
  };
  return (project?.expectedTables || []).filter(e => !have[e.side]?.has(key(e.name)));
}

/** Read the "still to come" box: one table per line. */
export function parseExpected(text, side) {
  return [...new Set(String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))].map(name => ({ side, name }));
}
