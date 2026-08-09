export const VERIFICATION_STATUSES = {
  mapped: { label: 'Mapped', phase: 'mapping', color: '#64748b' },
  sql_sent: { label: 'SQL sent', phase: 'delivery', color: '#2563eb' },
  test_uploaded: { label: 'In test', phase: 'test', color: '#d97706' },
  test_passed: { label: 'Test passed', phase: 'test', color: '#059669' },
  test_failed: { label: 'Test failed', phase: 'test', color: '#dc2626' },
  live_uploaded: { label: 'In live', phase: 'live', color: '#7c3aed' },
  live_passed: { label: 'Live passed', phase: 'live', color: '#059669' },
  live_failed: { label: 'Live failed', phase: 'live', color: '#dc2626' },
  signed_off: { label: 'Signed off', phase: 'done', color: '#0d5c63' },
};

export const NEXT_ACTIONS = {
  mapped: [{ status: 'sql_sent', label: 'Record SQL sent to supplier' }],
  sql_sent: [{ status: 'test_uploaded', label: 'Record uploaded to test' }],
  test_uploaded: [
    { status: 'test_passed', label: 'Test check passed' },
    { status: 'test_failed', label: 'Test check failed' },
  ],
  test_failed: [
    { status: 'sql_sent', label: 'Resend SQL / data' },
    { status: 'mapped', label: 'Mapping adjusted — resend SQL' },
  ],
  test_passed: [{ status: 'live_uploaded', label: 'Record pushed to live' }],
  live_uploaded: [
    { status: 'live_passed', label: 'Live check passed' },
    { status: 'live_failed', label: 'Live check failed' },
  ],
  live_failed: [
    { status: 'sql_sent', label: 'Resend from test cycle' },
    { status: 'live_uploaded', label: 'Re-pushed to live' },
  ],
  live_passed: [{ status: 'signed_off', label: 'Sign off column' }],
  signed_off: [],
};

export const TRACE_STEPS = [
  { key: 'mapped', action: 'Mapped', label: 'Mapped by', statuses: ['mapped'], recordStatus: null },
  { key: 'sql_sent', action: 'SQL sent', label: 'SQL sent by', statuses: ['sql_sent'], recordStatus: 'sql_sent' },
  { key: 'test_uploaded', action: 'Uploaded', label: 'Uploaded by', statuses: ['test_uploaded'], recordStatus: 'test_uploaded' },
  { key: 'test_checked', action: 'Checked in test', label: 'Tested in test by', statuses: ['test_passed', 'test_failed'], recordStatus: 'test_passed', failStatus: 'test_failed', checkStep: true },
  { key: 'live_uploaded', action: 'In live', label: 'Pushed to live by', statuses: ['live_uploaded'], recordStatus: 'live_uploaded' },
  { key: 'live_checked', action: 'Checked in live', label: 'Tested in live by', statuses: ['live_passed', 'live_failed'], recordStatus: 'live_passed', failStatus: 'live_failed', checkStep: true },
  { key: 'done', action: 'Done', label: 'Signed off by', statuses: ['signed_off'], recordStatus: 'signed_off' },
];

export function defaultVerification(note = 'Mapping created', by = 'system') {
  return {
    status: 'mapped',
    history: [{
      status: 'mapped',
      at: new Date().toISOString(),
      by,
      note,
      reference: '',
    }],
  };
}

export function ensureVerification(mapping) {
  if (!mapping.verification) {
    mapping.verification = defaultVerification();
  }
  if (!mapping.verification.history?.length) {
    mapping.verification.history = [{
      status: mapping.verification.status || 'mapped',
      at: new Date().toISOString(),
      by: 'system',
      note: 'Initial status',
      reference: '',
    }];
  }
  return mapping;
}

export function recordTransition(mapping, { status, by, note = '', reference = '', revertTo = null }) {
  ensureVerification(mapping);
  mapping.verification.status = status;
  const entry = {
    status,
    at: new Date().toISOString(),
    by: by || 'unknown',
    note,
    reference,
  };
  if (revertTo) entry.revertTo = revertTo;
  mapping.verification.history.push(entry);
  return mapping;
}

export const PHASE_GROUPS = {
  mapping: { label: 'Mapped', statuses: ['mapped'] },
  delivery: { label: 'SQL sent', statuses: ['sql_sent'] },
  test: { label: 'Test cycle', statuses: ['test_uploaded', 'test_passed', 'test_failed'] },
  live: { label: 'Live cycle', statuses: ['live_uploaded', 'live_passed', 'live_failed'] },
  done: { label: 'Signed off', statuses: ['signed_off'] },
};

export function countByPhase(mappings, phaseKey) {
  const statuses = PHASE_GROUPS[phaseKey]?.statuses || [];
  return mappings.filter(m => {
    ensureVerification(m);
    return statuses.includes(m.verification.status);
  }).length;
}

export function filterByPhase(mappings, phaseKey) {
  const statuses = PHASE_GROUPS[phaseKey]?.statuses || [];
  return mappings.filter(m => statuses.includes(m.verification?.status));
}

export function filterByTraceStep(mappings, stepKey) {
  return mappings.filter(m => {
    ensureVerification(m);
    return !!columnTraceability(m)[stepKey];
  });
}

export function filterMappings(mappings, { phase, status, traceStep } = {}) {
  if (status) return mappings.filter(m => m.verification?.status === status);
  if (traceStep) return filterByTraceStep(mappings, traceStep);
  if (phase) return filterByPhase(mappings, phase);
  return mappings;
}

export function traceStepSummary(mappings) {
  const counts = {};
  for (const step of TRACE_STEPS) counts[step.key] = 0;
  for (const m of mappings) {
    ensureVerification(m);
    const trace = columnTraceability(m);
    for (const step of TRACE_STEPS) {
      if (trace[step.key]) counts[step.key]++;
    }
  }
  return counts;
}

export function verificationSummary(mappings) {
  const counts = {};
  for (const key of Object.keys(VERIFICATION_STATUSES)) counts[key] = 0;
  for (const m of mappings) {
    ensureVerification(m);
    counts[m.verification.status] = (counts[m.verification.status] || 0) + 1;
  }
  return counts;
}

export function getEffectiveHistory(mapping) {
  ensureVerification(mapping);
  const history = mapping.verification.history;
  let revertIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].revertTo) {
      revertIdx = i;
      break;
    }
  }
  if (revertIdx < 0) return history;

  const originalMapped = history.find(h => h.status === 'mapped' && !h.revertTo);
  const sinceRevert = history.slice(revertIdx);
  if (originalMapped && revertIdx > 0 && !sinceRevert.includes(originalMapped)) {
    return [originalMapped, ...sinceRevert];
  }
  return sinceRevert;
}

export function countStepAttempts(mapping, stepKey) {
  const step = TRACE_STEPS.find(s => s.key === stepKey);
  if (!step) return 0;
  ensureVerification(mapping);
  return mapping.verification.history.filter(h => step.statuses.includes(h.status)).length;
}

export function columnTraceability(mapping) {
  ensureVerification(mapping);
  const history = getEffectiveHistory(mapping);
  const trace = {};

  for (const step of TRACE_STEPS) {
    let entry = null;
    if (step.key === 'mapped') {
      entry = history.find(h => step.statuses.includes(h.status));
    } else {
      for (let i = history.length - 1; i >= 0; i--) {
        if (step.statuses.includes(history[i].status)) {
          entry = history[i];
          break;
        }
      }
    }
    trace[step.key] = entry
      ? { by: entry.by, at: entry.at, status: entry.status }
      : null;
  }
  return trace;
}

export function nextTraceStepKey(mapping) {
  ensureVerification(mapping);
  const NEXT = {
    mapped: 'sql_sent',
    sql_sent: 'test_uploaded',
    test_uploaded: 'test_checked',
    test_passed: 'live_uploaded',
    live_uploaded: 'live_checked',
    live_passed: 'done',
    signed_off: null,
    test_failed: 'sql_sent',
    live_failed: 'live_uploaded',
  };
  return NEXT[mapping.verification.status] ?? null;
}

export function traceStepVisualState(mapping, stepKey) {
  const trace = columnTraceability(mapping);
  const nextKey = nextTraceStepKey(mapping);
  const entry = trace[stepKey];
  if (stepKey === nextKey) return 'next';
  if (entry) {
    if (entry.status === 'test_failed' || entry.status === 'live_failed') return 'failed';
    return 'done';
  }
  return 'pending';
}

export function recordTraceStep(mapping, stepKey, { by, pass = true, note = '' }) {
  const step = TRACE_STEPS.find(s => s.key === stepKey);
  if (!step?.recordStatus) return null;

  let status = step.recordStatus;
  if (step.checkStep && !pass) {
    status = step.failStatus;
    if (requiresNote(status) && !note) return null;
  }

  recordTransition(mapping, {
    status,
    by: by || 'unknown',
    note: note || (pass ? step.action : `${step.action} — failed`),
  });
  return mapping;
}

const REVERT_PREV_STATUS = {
  sql_sent: 'mapped',
  test_uploaded: 'sql_sent',
  test_checked: 'test_uploaded',
  live_uploaded: 'test_passed',
  live_checked: 'live_uploaded',
  done: 'live_passed',
};

export function canRevertTraceStep(mapping, stepKey) {
  if (stepKey === 'mapped') return false;
  const visual = traceStepVisualState(mapping, stepKey);
  return visual === 'done' || visual === 'failed';
}

export function revertToTraceStep(mapping, stepKey, { by, note = '' }) {
  const step = TRACE_STEPS.find(s => s.key === stepKey);
  const prevStatus = REVERT_PREV_STATUS[stepKey];
  if (!step || !prevStatus) return null;

  recordTransition(mapping, {
    status: prevStatus,
    by: by || 'unknown',
    note: note || `Reverted to re-do from ${step.action}`,
    revertTo: stepKey,
  });
  return mapping;
}

export function formatTraceabilityRows(mappings) {
  return mappings.map(m => {
    const trace = columnTraceability(m);
    const row = {
      source_table: m.sourceTable,
      source_column: m.sourceColumn,
      target_table: m.targetTable,
      target_column: m.targetColumn,
      transform_notes: m.transformNotes || '',
      lookup_rule: m.lookupRule || '',
      default_value: m.defaultValue || '',
      verification_status: m.verification?.status || 'mapped',
    };
    for (const step of TRACE_STEPS) {
      row[step.key + '_by'] = trace[step.key]?.by || '';
      row[step.key + '_at'] = trace[step.key]?.at || '';
      row[step.key + '_attempts'] = countStepAttempts(m, step.key);
    }
    return row;
  });
}

export function statusMeta(status) {
  return VERIFICATION_STATUSES[status] || VERIFICATION_STATUSES.mapped;
}

export function ensureProjectParties(project) {
  if (!project.parties) {
    project.parties = {
      la: { name: '', email: '', label: 'LA business owner' },
      supplier: { name: '', email: '', label: 'Supplier / target system' },
      consultant: { name: '', email: '', label: 'Delivery consultant' },
    };
  }
  return project;
}

export function partyOptions(project) {
  ensureProjectParties(project);
  const opts = [{ value: '', label: 'Unassigned' }];
  for (const [key, p] of Object.entries(project.parties)) {
    if (p.name?.trim()) {
      opts.push({ value: key, label: `${p.name} (${p.label || key})` });
    }
  }
  return opts;
}

export function ownerDisplay(mapping, project) {
  if (mapping.ownerName) return mapping.ownerName;
  if (mapping.ownerRole && project?.parties?.[mapping.ownerRole]?.name) {
    return project.parties[mapping.ownerRole].name;
  }
  return '—';
}

export function statusOptionsForSelect() {
  return Object.entries(VERIFICATION_STATUSES).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));
}

export function setMappingStatus(mapping, { status, by, note = '', reference = '' }) {
  ensureVerification(mapping);
  const prev = mapping.verification.status;
  if (prev === status) return mapping;
  recordTransition(mapping, {
    status,
    by,
    note: note || `Status set to ${VERIFICATION_STATUSES[status]?.label || status}`,
    reference,
  });
  return mapping;
}

export function formatColumnRef(m) {
  return `${m.sourceTable}.${m.sourceColumn} → ${m.targetTable}.${m.targetColumn}`;
}

export function requiresNote(status) {
  return status === 'test_failed' || status === 'live_failed';
}
