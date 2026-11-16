// Reads a supplier's "mapping master" spreadsheet: one row per field in the
// new system's load templates, often with the old system's table and field
// noted alongside by the project team.
//
// From one file it produces the new system's field list, the old system
// fields that were referred to, the matches already made, and three work
// lists: fields marked as not used, fields with an open question, and fields
// with no match yet.

const BLANK = new Set(['', '�', '�', '-', 'n/a', 'na']);
const NOT_USED = /^(not used( in \w+)?|no|not available|none|n\/a)$/i;

const clean = v => String(v ?? '').replace(/�/g, '').trim();
const isBlank = v => BLANK.has(clean(v).toLowerCase());

const ALIASES = {
  section: ['template', 'section', 'area'],
  table: ['csv_name', 'template_table', 'target_table', 'table_name'],
  column: ['column_name', 'field_name', 'target_field', 'target_column'],
  type: ['data_type', 'type'],
  maxChars: ['max_characters', 'max_length', 'length'],
  maxDigits: ['max_digits', 'precision'],
  lookup: ['lookup_code_type', 'lookup', 'code_type'],
  comments: ['addition_comments', 'additional_comments', 'comments', 'description'],
  note: ['note', 'notes'],
  checked: ['checked and correct', 'checked'],
};

function norm(h) {
  return clean(h).toLowerCase().replace(/\s+/g, ' ');
}

// Work out which column plays which part from the heading row.
export function detectColumns(header) {
  const names = header.map(norm);
  const cols = {};
  for (const [role, options] of Object.entries(ALIASES)) {
    const i = names.findIndex(n => options.includes(n) || options.includes(n.replace(/ /g, '_')));
    if (i >= 0) cols[role] = i;
  }
  // The old system's columns are headed "<System>Table" and "<System>Field".
  for (let i = 0; i < header.length; i++) {
    const m = /^(.+?)[ _]?table$/i.exec(clean(header[i]));
    if (!m || i === cols.table) continue;
    const j = header.findIndex(h => new RegExp(`^${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ _]?field$`, 'i').test(clean(h)));
    if (j >= 0) { cols.sourceTable = i; cols.sourceField = j; cols.sourceSystem = m[1].trim(); break; }
  }
  return cols;
}

function titleCase(text) {
  return clean(text).toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

/**
 * @param {string[][]} rows  the spreadsheet as rows of cells, heading row first
 * @param {object} [opts]
 * @param {string} [opts.targetSystem]
 * @param {string} [opts.sourceSystem]
 */
export function parseMappingTemplate(rows, { targetSystem = '', sourceSystem = '' } = {}) {
  if (!rows?.length) throw new Error('The file is empty.');
  const header = rows[0];
  const c = detectColumns(header);
  if (c.table === undefined || c.column === undefined) {
    throw new Error('This does not look like a mapping template. It needs columns for the new system table and field, such as "csv_name" and "column_name".');
  }
  const cell = (r, role) => (c[role] === undefined ? '' : clean(r[c[role]]));
  const hasSource = c.sourceTable !== undefined;

  const targetTables = new Map();
  const sourceTables = new Map();
  const mappings = [];
  const notUsed = [];
  const questions = [];
  const unmatched = [];
  const duplicates = [];
  const seen = new Set();
  let section = '';
  let checked = 0;

  for (const r of rows.slice(1)) {
    const table = cell(r, 'table');
    const column = cell(r, 'column');
    // A row with only the first cell filled names the section that follows.
    if (!table && !column) {
      const s = cell(r, 'section');
      if (s && !/^\d+$/.test(s)) section = titleCase(s);
      continue;
    }
    if (!table || !column) continue;
    if (norm(table) === norm(header[c.table]) && norm(column) === norm(header[c.column])) continue; // repeated heading row

    const key = `${table}␟${column}`;
    if (seen.has(key)) { duplicates.push({ table, column }); continue; }
    seen.add(key);

    // ----- new system field -----
    const baseType = cell(r, 'type');
    const chars = cell(r, 'maxChars');
    const digits = cell(r, 'maxDigits');
    const type = !baseType ? '' : !isBlank(chars) && /char|text|string/i.test(baseType) ? `${baseType}(${chars})` : baseType;
    const comment = isBlank(cell(r, 'comments')) ? '' : cell(r, 'comments');
    const lookup = isBlank(cell(r, 'lookup')) ? '' : cell(r, 'lookup');
    if (!targetTables.has(table)) targetTables.set(table, { name: table, section, columns: [] });
    targetTables.get(table).columns.push({
      name: column,
      type,
      required: false,
      description: comment,
      values: [lookup ? `Lookup code type ${lookup}` : '', !isBlank(digits) && !/char|text/i.test(baseType) ? `Up to ${digits} digits` : ''].filter(Boolean).join(' · '),
    });

    if (!isBlank(cell(r, 'checked'))) checked++;
    if (!hasSource) { unmatched.push({ table, column }); continue; }

    // ----- what the team recorded about the old system -----
    const sTable = cell(r, 'sourceTable');
    const sField = cell(r, 'sourceField');
    const note = cell(r, 'note');
    const ref = { table, column, sourceTable: sTable, sourceField: sField, note };
    const query = /\?/.test(sTable) || /\?/.test(sField) || /\?/.test(note);

    if (NOT_USED.test(sTable) || NOT_USED.test(sField)) { notUsed.push(ref); continue; }
    if (isBlank(sTable) && isBlank(sField)) { (query ? questions : unmatched).push(ref); continue; }
    if (isBlank(sTable) || isBlank(sField) || /\?/.test(sTable) || /\?/.test(sField)) { questions.push(ref); continue; }

    if (!sourceTables.has(sTable)) sourceTables.set(sTable, { name: sTable, columns: new Map() });
    const st = sourceTables.get(sTable);
    if (!st.columns.has(sField)) {
      st.columns.set(sField, { name: sField, type: '', required: false, description: 'Named in the mapping template. Type and meaning not yet confirmed.', values: '' });
    }
    mappings.push({
      sourceTable: sTable, sourceColumn: sField, targetTable: table, targetColumn: column,
      transformNotes: isBlank(note) ? '' : note, lookupRule: '', defaultValue: '',
      serviceArea: section, needsReview: query,
    });
    if (query) questions.push(ref);
  }

  const targetSchema = {
    system: targetSystem,
    tables: [...targetTables.values()].map(t => ({ name: t.name, ...(t.section ? { section: t.section } : {}), columns: t.columns })),
  };
  const sourceSchema = {
    system: sourceSystem || c.sourceSystem || '',
    tables: [...sourceTables.values()].map(t => ({ name: t.name, columns: [...t.columns.values()] })),
  };
  const fields = targetSchema.tables.reduce((n, t) => n + t.columns.length, 0);
  const described = targetSchema.tables.reduce((n, t) => n + t.columns.filter(col => col.description).length, 0);

  return {
    detected: { ...c, header: header.map(clean) },
    targetSchema, sourceSchema, mappings, notUsed, questions, unmatched, duplicates,
    areas: [...new Set([...targetTables.values()].map(t => t.section).filter(Boolean))],
    stats: {
      tables: targetSchema.tables.length, fields, described,
      sourceTables: sourceSchema.tables.length,
      sourceFields: sourceSchema.tables.reduce((n, t) => n + t.columns.length, 0),
      matched: mappings.length, notUsed: notUsed.length, questions: questions.length,
      unmatched: unmatched.length, checked, duplicates: duplicates.length,
    },
  };
}

// Add a parsed field list to an existing one without removing anything.
export function mergeSchema(existing, incoming) {
  const out = { system: existing?.system || incoming.system || '', tables: (existing?.tables || []).map(t => ({ ...t, columns: [...(t.columns || [])] })) };
  let added = 0;
  for (const t of incoming.tables) {
    let table = out.tables.find(x => x.name === t.name);
    if (!table) { table = { name: t.name, columns: [] }; out.tables.push(table); }
    // Keep the table's area, unless it already has one.
    if (t.section && !table.section) table.section = t.section;
    for (const col of t.columns) {
      if (!table.columns.some(x => x.name === col.name)) { table.columns.push(col); added++; }
    }
  }
  return { schema: out, added };
}

// The questions as a list to send to the supplier or service area.
export function questionRows(parsed) {
  return [
    ...parsed.questions.map(q => ({ new_system_table: q.table, new_system_field: q.column, status: 'Question', old_system_table: q.sourceTable, old_system_field: q.sourceField, note: q.note })),
    ...parsed.unmatched.map(q => ({ new_system_table: q.table, new_system_field: q.column, status: 'No match yet', old_system_table: '', old_system_field: '', note: q.note || '' })),
  ];
}
