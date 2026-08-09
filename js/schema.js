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
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 1) throw new Error('CSV file is empty.');

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const typeRow = lines[1]?.split(',').map(c => c.trim().replace(/^"|"$/g, ''));

  const columns = headers.map((name, i) => ({
    name,
    type: typeRow?.[i] || 'string',
    required: !name.toLowerCase().includes('optional'),
  }));

  return normalizeSchema({
    system: 'CSV Upload',
    tables: [{ name: tableName, columns }],
  });
}

function normalizeSchema(schema) {
  const tables = (schema.tables || []).map(t => ({
    name: String(t.name),
    columns: (t.columns || []).map(c => ({
      name: String(c.name),
      type: String(c.type || 'string'),
      required: Boolean(c.required),
    })),
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
