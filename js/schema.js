export function parseJSONSchema(text) {
  const data = JSON.parse(text);
  if (data.tables && Array.isArray(data.tables)) {
    return normalizeSchema(data);
  }
  if (Array.isArray(data)) {
    return normalizeSchema({ tables: data });
  }
  throw new Error('JSON must contain a "tables" array or be an array of tables.');
}

export function parseCSVTemplate(text, tableName = 'Uploaded_Template') {
  if (typeof Papa === 'undefined') {
    throw new Error('Papa Parse library not loaded. Cannot parse CSV.');
  }

  const parsed = Papa.parse(text, { skipEmptyLines: true });
  
  if (parsed.errors?.length) {
    const criticalErrors = parsed.errors.filter(e => e.type === 'FieldMismatch' || e.type === 'Quotes');
    if (criticalErrors.length) {
      throw new Error(`CSV parsing error: ${criticalErrors[0].message} (row ${criticalErrors[0].row + 1})`);
    }
  }

  const rows = parsed.data;
  if (rows.length < 1) throw new Error('CSV file is empty.');

  const headers = rows[0].map(h => String(h || '').trim());
  if (!headers.filter(Boolean).length) throw new Error('CSV has no column headers in first row.');

  const typeRow = rows[1]?.map(c => String(c || '').trim());
  let descRow = null;
  let valuesRow = null;

  if (rows[2]) {
    const candidate = rows[2].map(c => String(c || '').trim());
    if (candidate.length === headers.length && !rowLooksLikeTypes(candidate)) {
      descRow = candidate;
      if (rows[3]) {
        const valuesCandidate = rows[3].map(c => String(c || '').trim());
        if (valuesCandidate.length === headers.length && !rowLooksLikeTypes(valuesCandidate)) {
          valuesRow = valuesCandidate;
        }
      }
    }
  }

  const skippedRows = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== headers.length) {
      skippedRows.push({ rowIndex: i + 1, columnCount: rows[i].length, expected: headers.length });
    }
  }

  const columns = headers.map((name, i) => ({
    name,
    type: typeRow?.[i] || 'string',
    required: !name.toLowerCase().includes('optional'),
    description: descRow?.[i] || '',
    values: valuesRow?.[i] || '',
  }));

  const schema = normalizeSchema({
    system: 'CSV Upload',
    tables: [{ name: tableName, columns }],
  });

  if (skippedRows.length) {
    schema._warnings = [`${skippedRows.length} row(s) had mismatched column counts and were skipped: ${skippedRows.slice(0, 3).map(r => `row ${r.rowIndex} had ${r.columnCount} columns instead of ${r.expected}`).join('; ')}${skippedRows.length > 3 ? ` and ${skippedRows.length - 3} more` : ''}`];
  }

  return schema;
}

const TYPE_PATTERN = /^(int|integer|string|varchar|char|date|datetime|lookup|code|bool|boolean|decimal|numeric|float|double|text|number)/i;

function rowLooksLikeTypes(cells) {
  const filled = cells.filter(Boolean);
  if (!filled.length) return false;
  return filled.every(c => TYPE_PATTERN.test(c));
}

function normalizeColumn(c) {
  return {
    name: String(c.name),
    type: String(c.type || 'string'),
    required: Boolean(c.required),
    description: String(c.description || '').trim(),
    values: String(c.values || '').trim(),
  };
}

function normalizeSchema(schema) {
  const tables = (schema.tables || []).map(t => ({
    name: String(t.name),
    columns: (t.columns || []).map(normalizeColumn),
  }));

  if (!tables.length) throw new Error('No tables found in schema.');
  tables.forEach(t => {
    if (!t.columns.length) throw new Error(`Table "${t.name}" has no columns.`);
  });

  return {
    system: schema.system || 'Unknown',
    tables,
    importedAt: new Date().toISOString(),
  };
}

export function schemaStats(schema) {
  if (!schema) return { tables: 0, columns: 0 };
  const columns = schema.tables.reduce((n, t) => n + t.columns.length, 0);
  return { tables: schema.tables.length, columns };
}

export function allColumns(schema) {
  const cols = [];
  for (const table of schema?.tables || []) {
    for (const col of table.columns) {
      cols.push({ table: table.name, ...col, key: `${table.name}.${col.name}` });
    }
  }
  return cols;
}

export function getSchemaColumn(schema, tableName, columnName) {
  const table = schema?.tables?.find(t => t.name === tableName);
  return table?.columns?.find(c => c.name === columnName) || null;
}

export function valuesFormatMismatch(sourceCol, targetCol) {
  if (!sourceCol?.values || !targetCol?.values) return false;
  const norm = v => v.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(sourceCol.values) !== norm(targetCol.values);
}

export function formatColumnValues(col) {
  if (!col?.values) return '';
  return col.values;
}

export function mappingProgress(sourceSchema, targetSchema, mappings) {
  const sourceCols = allColumns(sourceSchema);
  const targetCols = allColumns(targetSchema);
  const mappedSource = new Set(mappings.map(m => `${m.sourceTable}.${m.sourceColumn}`));
  const mappedTarget = new Set(mappings.map(m => `${m.targetTable}.${m.targetColumn}`));

  const requiredTarget = targetCols.filter(c => c.required);
  const requiredMapped = requiredTarget.filter(c => mappedTarget.has(c.key)).length;

  return {
    sourceTotal: sourceCols.length,
    targetTotal: targetCols.length,
    mappedCount: mappings.length,
    sourceMapped: mappedSource.size,
    targetMapped: mappedTarget.size,
    unmappedSource: sourceCols.filter(c => !mappedSource.has(c.key)),
    unmappedTarget: targetCols.filter(c => !mappedTarget.has(c.key)),
    requiredTargetTotal: requiredTarget.length,
    requiredTargetMapped: requiredMapped,
    percent: targetCols.length
      ? Math.round((mappedTarget.size / targetCols.length) * 100)
      : 0,
  };
}

export async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
