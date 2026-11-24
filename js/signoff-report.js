// The sign-off report: the evidence pack as a page people can read, print,
// sign and attach to a milestone certificate. It covers every field: what
// was matched and who did each step, what was removed and why, and what was
// left behind and why. A SHA-256 fingerprint of the evidence pack is printed
// on it, so a printed copy can be checked against the downloaded pack.

import { columnTraceability, TRACE_STEPS, statusMeta } from './verification.js';
import { unmatchedOldFields, decisionSummary } from './field-record.js';
import { buildExportPackage, evidenceFingerprint } from './export.js';

export const REPORT_TEXT = {
  title: 'Sign-off report',
  print: 'Print or save as PDF',
  lead: 'What happened to every field in this move: what was matched and who did each step, what was removed and why, and what was left behind and why.',
  incomplete: 'This report is not complete yet',
  complete: 'Every field is accounted for',
  fingerprint: 'Fingerprint of the evidence pack',
  fingerprintHelp: 'Download the evidence pack from Hand over at the same time as you print this. If the pack is changed later, its fingerprint will no longer match this one.',
  agreed: 'Agreed by',
};

const day = iso => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const stepCell = t => (t ? `${(t.names?.length ? t.names.join(', ') : t.by) || ''}${t.at ? `, ${day(t.at)}` : ''}` : '');

/** Everything the report shows, worked out from the project. */
export function reportData(project) {
  const mappings = project.mappings || [];
  const byArea = new Map();
  for (const m of mappings) {
    const area = m.serviceArea || 'No area set';
    if (!byArea.has(area)) byArea.set(area, []);
    const t = columnTraceability(m);
    byArea.get(area).push({
      from: `${m.sourceTable}.${m.sourceColumn}`,
      to: `${m.targetTable}.${m.targetColumn}`,
      rules: [m.lookupRule && `Translation: ${m.lookupRule}`, m.defaultValue && `Default: ${m.defaultValue}`, m.transformNotes].filter(Boolean).join(' · '),
      status: statusMeta(m.verification?.status).label,
      matched: stepCell(t.mapped),
      checkedLive: stepCell(t.live_checked),
      signed: stepCell(t.done),
      signedOff: m.verification?.status === 'signed_off',
    });
  }
  const notMoving = unmatchedOldFields(project).filter(f => f.decision).map(f => ({
    field: `${f.table}.${f.column}`, reason: f.decision.reason, by: f.decision.by, at: f.decision.at,
  }));
  const undecided = unmatchedOldFields(project).filter(f => !f.decision).map(f => `${f.table}.${f.column}`);
  const removed = (project.removedMatches || []).map(r => ({
    from: `${r.sourceTable}.${r.sourceColumn}`, to: `${r.targetTable}.${r.targetColumn}`,
    reason: r.removed?.reason || '', by: r.removed?.by || '', at: r.removed?.at || '',
  }));
  const signedOff = mappings.filter(m => m.verification?.status === 'signed_off').length;
  const d = decisionSummary(project);
  const gaps = [];
  if (d.undecided) gaps.push(`${d.undecided} old ${d.undecided === 1 ? 'field has' : 'fields have'} no match and no decision.`);
  if (mappings.length - signedOff) gaps.push(`${mappings.length - signedOff} ${mappings.length - signedOff === 1 ? 'match is' : 'matches are'} not signed off.`);
  return {
    project: { name: project.name, oldSystem: project.sourceSystem || 'Old system', newSystem: project.targetSystem || 'New system' },
    counts: {
      matches: mappings.length,
      signedOff,
      notMoving: notMoving.length,
      undecided: undecided.length,
      removed: removed.length,
      checks: (project.reconRuns || []).length,
      areaSignoffs: (project.reconAreaSignoffs || []).length,
    },
    areas: [...byArea.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => ({ name, rows })),
    notMoving,
    undecided,
    removed,
    signoffs: (project.reconAreaSignoffs || []).map(s => ({ area: s.area, name: s.name, role: s.role, note: s.note, at: s.at })),
    checks: (project.reconRuns || []).map(r => ({ label: r.label, at: r.at, by: r.by, fingerprint: r.fingerprint || '', exceptions: r.summary?.exceptions ?? 0 })),
    gaps,
  };
}

export function reportHtml(data, { esc, fingerprint = '', generatedAt = new Date().toISOString(), generatedBy = '' }) {
  const T = REPORT_TEXT;
  const c = data.counts;
  const table = (head, rows) => rows.length
    ? `<table class="report-table"><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
    : '<p class="recon-sub">None.</p>';
  const stat = (n, label) => `<div class="report-stat"><span class="report-stat-n">${esc(n)}</span><span>${esc(label)}</span></div>`;
  return `
    <article class="report">
      <header class="report-head">
        <div>
          <p class="report-eyebrow">${esc(T.title)}</p>
          <h1>${esc(data.project.name)}</h1>
          <p>${esc(data.project.oldSystem)} to ${esc(data.project.newSystem)}</p>
          <p class="recon-sub">Made ${esc(day(generatedAt))}${generatedBy ? ` by ${esc(generatedBy)}` : ''}.</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm no-print" id="report-print">${esc(T.print)}</button>
      </header>
      <p>${esc(T.lead)}</p>

      ${data.gaps.length
        ? `<div class="report-gaps" role="status"><h2>${esc(T.incomplete)}</h2><ul>${data.gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>`
        : `<div class="report-ok" role="status"><h2>${esc(T.complete)}</h2></div>`}

      <div class="report-stats">
        ${stat(c.matches, 'matches')}
        ${stat(c.signedOff, 'signed off')}
        ${stat(c.notMoving, 'not moving, with a reason')}
        ${stat(c.removed, 'matches removed, with a reason')}
        ${stat(c.checks, 'file comparisons')}
        ${stat(c.areaSignoffs, 'area sign-offs')}
      </div>

      <h2>Matches, by service area</h2>
      ${data.areas.length ? data.areas.map(a => `
        <h3>${esc(a.name)} <span class="recon-sub">${a.rows.length} ${a.rows.length === 1 ? 'match' : 'matches'}</span></h3>
        ${table(['Old field', 'New field', 'Rules', 'Matched', 'Checked in live', 'Signed off'], a.rows.map(r => `
          <tr><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.rules)}</td><td>${esc(r.matched)}</td><td>${esc(r.checkedLive)}</td><td>${r.signedOff ? esc(r.signed) : `<span class="recon-sub">${esc(r.status)}</span>`}</td></tr>`))}`).join('') : '<p class="recon-sub">No matches yet.</p>'}

      <h2>Not moving</h2>
      <p class="recon-sub">Old fields that were deliberately left behind.</p>
      ${table(['Old field', 'Reason', 'Recorded by', 'When'], data.notMoving.map(r => `<tr><td>${esc(r.field)}</td><td>${esc(r.reason)}</td><td>${esc(r.by)}</td><td>${esc(day(r.at))}</td></tr>`))}
      ${data.undecided.length ? `<p class="report-warn">Still to decide: ${data.undecided.map(esc).join(', ')}.</p>` : ''}

      <h2>Matches removed</h2>
      <p class="recon-sub">Matches that were deleted, replaced or dropped. Their full history is in the evidence pack.</p>
      ${table(['Old field', 'New field', 'Reason', 'Removed by', 'When'], data.removed.map(r => `<tr><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.reason)}</td><td>${esc(r.by)}</td><td>${esc(day(r.at))}</td></tr>`))}

      <h2>Area sign-offs</h2>
      ${table(['Area', 'Name', 'Decision', 'Note', 'When'], data.signoffs.map(s => `<tr><td>${esc(s.area)}</td><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.note)}</td><td>${esc(day(s.at))}</td></tr>`))}

      <h2>File comparisons</h2>
      ${table(['Load', 'When', 'By', 'Problems found', 'Fingerprint'], data.checks.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(day(r.at))}</td><td>${esc(r.by)}</td><td>${esc(r.exceptions)}</td><td class="report-mono">${esc(r.fingerprint.slice(0, 16))}${r.fingerprint ? '…' : ''}</td></tr>`))}

      <section class="report-fingerprint">
        <h2>${esc(T.fingerprint)}</h2>
        <p class="report-mono">${esc(fingerprint || 'Working out…')}</p>
        <p class="recon-sub">${esc(T.fingerprintHelp)}</p>
      </section>

      <section class="report-sign">
        <h2>${esc(T.agreed)}</h2>
        ${['Name', 'Role', 'Signature', 'Date'].map(l => `<p><span>${esc(l)}</span><span class="report-line"></span></p>`).join('')}
      </section>
    </article>`;
}

/** The report page. The fingerprint is worked out after the page shows. */
export async function renderSignoffReport({ id }, ui) {
  const project = ui.getProject(id);
  if (!project) return ui.renderNotFound();
  const user = ui.getCurrentUser();
  const data = reportData(project);
  const generatedAt = new Date().toISOString();
  document.getElementById('app-shell').innerHTML = ui.nav(project.name) + '<main class="app-main" id="app-main"></main>';
  const draw = fingerprint => {
    ui.mount(`${ui.projectSteps(project, 'report')}${reportHtml(data, { esc: ui.esc, fingerprint, generatedAt, generatedBy: user?.name || '' })}`);
    document.getElementById('report-print')?.addEventListener('click', () => window.print());
  };
  draw('');
  ui.attachLogout?.();
  try {
    const fp = await evidenceFingerprint(buildExportPackage(project, user));
    if (location.hash.endsWith(`/projects/${id}/report`)) draw(fp);
  } catch {
    if (location.hash.endsWith(`/projects/${id}/report`)) draw('Could not be worked out in this browser.');
  }
}
