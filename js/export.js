import { formatTraceabilityRows } from './verification.js';

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
      serviceArea: m.serviceArea || '',
      verificationStatus: m.verification?.status || 'mapped',
      verificationHistory: m.verification?.history || [],
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
  return formatTraceabilityRows(mappings);
}

export function verificationHistoryRows(mappings) {
  const rows = [];
  for (const m of mappings) {
    for (const h of m.verification?.history || []) {
      rows.push({
        source_table: m.sourceTable,
        source_column: m.sourceColumn,
        target_table: m.targetTable,
        target_column: m.targetColumn,
        status: h.status,
        at: h.at,
        by: h.by,
        note: h.note,
        reference: h.reference || '',
        revert_to: h.revertTo || '',
        participants: (h.participants || []).join(', '),
      });
    }
  }
  return rows;
}

export function downloadExcel(mappings, filename) {
  if (typeof XLSX === 'undefined') {
    downloadCSV(mappingsToRows(mappings), filename.replace('.xlsx', '.csv'));
    return;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mappingsToRows(mappings)), 'Mappings');
  const history = verificationHistoryRows(mappings);
  if (history.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(history), 'Verification log');
  }
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
    const parts = [];
    parts.push(`-- ${m.sourceTable}.${m.sourceColumn} -> ${m.targetTable}.${m.targetColumn}`);
    
    if (m.transformNotes) {
      parts.push(`-- Transform: ${m.transformNotes}`);
    }
    if (m.lookupRule) {
      parts.push(`-- Lookup rule: ${m.lookupRule}`);
    }
    if (m.defaultValue) {
      parts.push(`-- Default value: ${m.defaultValue}`);
    }
    
    let selectExpression = m.sourceColumn;
    
    if (m.lookupRule) {
      const lookupLines = m.lookupRule.split(/[,;\n]/).map(l => l.trim()).filter(Boolean);
      if (lookupLines.length > 0) {
        parts.push('-- Value translation:');
        const caseLines = lookupLines.map(line => {
          const match = line.match(/^(.+?)\s*[-=]>\s*(.+)$/);
          if (match) {
            const [, from, to] = match;
            return `    WHEN ${selectExpression} = '${from.trim()}' THEN '${to.trim()}'`;
          }
          return `    -- TODO: Parse lookup rule: ${line}`;
        });
        selectExpression = `CASE\n${caseLines.join('\n')}\n    ELSE ${selectExpression}\n  END`;
      }
    }
    
    if (m.defaultValue) {
      selectExpression = `COALESCE(${selectExpression}, '${m.defaultValue}')`;
    }
    
    if (m.transformNotes && !m.lookupRule) {
      parts.push(`-- TODO: Implement transformation logic for: ${m.transformNotes}`);
    }
    
    parts.push(`SELECT`);
    parts.push(`  ${selectExpression} AS ${m.targetColumn}`);
    parts.push(`FROM ${m.sourceTable};`);
    
    return parts.join('\n');
  }).join('\n\n');
}
