export function buildExportPackage(project, user) {
  return {
    exportedAt: new Date().toISOString(),
    exportedBy: user?.email || 'unknown',
    project: {
      id: project.id,
      name: project.name,
      sourceSystem: project.sourceSystem,
      targetSystem: project.targetSystem,
      status: project.status,
    },
    sourceSchema: project.sourceSchema,
    targetSchema: project.targetSchema,
    mappings: project.mappings.map(m => ({
      sourceTable: m.sourceTable,
      sourceColumn: m.sourceColumn,
      targetTable: m.targetTable,
      targetColumn: m.targetColumn,
      transformNotes: m.transformNotes || '',
      lookupRule: m.lookupRule || '',
      defaultValue: m.defaultValue || '',
    })),
    summary: {
      totalMappings: project.mappings.length,
    },
  };
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

export function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  triggerDownload(blob, filename);
}

export function mappingsToRows(mappings) {
  return mappings.map(m => ({
    source_table: m.sourceTable,
    source_column: m.sourceColumn,
    target_table: m.targetTable,
    target_column: m.targetColumn,
    transform_notes: m.transformNotes || '',
    lookup_rule: m.lookupRule || '',
    default_value: m.defaultValue || '',
  }));
}

export function downloadExcel(mappings, filename) {
  if (typeof XLSX === 'undefined') {
    downloadCSV(mappingsToRows(mappings), filename.replace('.xlsx', '.csv'));
    return;
  }
  const rows = mappingsToRows(mappings);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mappings');
  XLSX.writeFile(wb, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateSQLStubs(mappings) {
  return mappings.map(m => {
    const notes = [m.transformNotes, m.lookupRule].filter(Boolean).join('; ');
    return `-- ${m.sourceTable}.${m.sourceColumn} -> ${m.targetTable}.${m.targetColumn}${notes ? `\n-- ${notes}` : ''}\nSELECT ${m.sourceColumn} AS ${m.targetColumn}\nFROM ${m.sourceTable};`;
  }).join('\n\n');
}
