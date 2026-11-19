// Turns a reconciliation run into a plain-English summary for someone who is
// not a data specialist: a finance lead or project sponsor who wants to know
// whether the move is going well.
//
// Nothing here re-decides anything. It only rewords what reconcile.js found.

import { allGroups, compareWithHistory, trendFor, formatAmount, getColumn } from './reconcile.js';

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

// "gl_balance" -> "GL balance", "Supplier_Load" -> "supplier load"
export function tableNoun(name) {
  return String(name || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => (w.length <= 2 ? w.toUpperCase() : w.toLowerCase()))
    .join(' ');
}

function humanise(column) {
  const words = String(column || '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[_\s]+/).filter(Boolean);
  const text = words.map(w => (w.length <= 2 ? w.toUpperCase() : w.toLowerCase())).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The everyday name of a field: the new system's description if there is one,
// then the old system's, then the column name tidied up.
export function fieldLabel(project, sourceTable, sourceColumn, targetTable, targetColumn) {
  const t = getColumn(project?.targetSchema, targetTable, targetColumn);
  const s = getColumn(project?.sourceSchema, sourceTable, sourceColumn);
  const text = (t?.description || s?.description || '').trim();
  return text || humanise(targetColumn || sourceColumn);
}

function lowerFirst(text) {
  // Keep acronyms such as "VAT code" or "GL account" as they are.
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

const SEVERITY_PLAIN = { high: 'Serious', medium: 'Moderate', low: 'Minor' };

const WHY = {
  missing_record: 'These would simply not be there on day one.',
  unexpected_record: 'Something has been created that nobody asked for, so it needs explaining.',
  duplicate_target: 'The same thing would exist twice, which can lead to double counting.',
  duplicate_source: 'The old system’s file has repeats, so the comparison for these is unreliable.',
  blank_key: 'Without a reference there is no way to tell which record is which.',
  wrong_translation: 'The agreed rule is not being followed, so people would see the wrong information.',
  no_translation_rule: 'Nobody has decided what this should become, so the new system has been left to guess.',
  truncated: 'Longer entries are being cut off and the end is lost.',
  blank_in_target: 'Information held today would be lost.',
  unexpected_value: 'The new system is showing something the old one did not hold.',
  value_differs: 'What people see in the new system would not match the old one.',
  case_only: 'Cosmetic only. No information is lost.',
  total_differs: 'The figures do not add up between the two systems.',
  total_unreadable: 'Until every value can be read, nobody can say whether the money adds up.',
  not_checked: 'This part has not been checked at all, so it is neither right nor wrong yet.',
};

function quote(v) {
  return `“${v}”`;
}

// One plain sentence for a group of identical differences.
function issueSentence(g, label, noun) {
  const n = g.count;
  const recs = `${num(n)} ${noun} ${plural(n, 'record')}`;
  const ex = g.examples?.[0];
  const field = label;
  switch (g.kind) {
    case 'missing_record':
      return `${recs} did not arrive in the new system.`;
    case 'unexpected_record':
      return `${recs} ${plural(n, 'is', 'are')} in the new system but ${plural(n, 'was', 'were')} not in the old one.`;
    case 'duplicate_target':
      return `${recs} ${plural(n, 'appears', 'appear')} more than once in the new system.`;
    case 'duplicate_source':
      return `${recs} ${plural(n, 'appears', 'appear')} more than once in the file from the old system.`;
    case 'blank_key':
      return `${recs} could not be checked because ${plural(n, 'its reference is', 'their references are')} blank.`;
    case 'wrong_translation':
      return ex
        ? `On ${recs}, ${lowerFirst(field)} was ${quote(ex.source)} and should now read ${quote(ex.expected)}, but the new system shows ${quote(ex.actual)}.`
        : `On ${recs}, ${lowerFirst(field)} has not been converted the way that was agreed.`;
    case 'no_translation_rule':
      return ex
        ? `${recs} ${plural(n, 'has', 'have')} the old ${lowerFirst(field)} value ${quote(ex.source)}, and no new value has been agreed for it. The new system currently shows ${quote(ex.actual)}.`
        : `${recs} ${plural(n, 'has', 'have')} an old ${lowerFirst(field)} value with no agreed new value.`;
    case 'truncated':
      return `${field} has been cut short on ${recs}.`;
    case 'blank_in_target':
      return `${field} is empty in the new system on ${recs} where the old system held a value.`;
    case 'unexpected_value':
      return `${field} has a value in the new system on ${recs} where the old system was empty.`;
    case 'value_differs':
      return `${field} is different in the new system on ${recs}.`;
    case 'case_only':
      return `${field} differs only in capital letters on ${recs}.`;
    case 'total_differs':
      return `The total for ${lowerFirst(field)} does not agree between the two systems.`;
    case 'total_unreadable': {
      const u = g.unreadable || {};
      const where = [u.source ? `${num(u.source)} in the old file` : '', u.target ? `${num(u.target)} in the new file` : ''].filter(Boolean).join(' and ');
      return `No total was taken for ${lowerFirst(field)}: ${num(n)} ${plural(n, 'value')} (${where}) could not be read as ${plural(n, 'an amount', 'amounts')}${u.example ? `, for example ${quote(u.example)}` : ''}.`;
    }
    case 'not_checked':
      return `${field} could not be checked because it was missing from one of the files.`;
    default:
      return g.title;
  }
}

function splitArrow(text) {
  const parts = String(text || '').split(' → ');
  return parts.length === 2 ? parts : [text, text];
}

function plainIssue(g, project) {
  const [sourceTable, targetTable] = splitArrow(g.table);
  const [sourceColumn, targetColumn] = splitArrow(g.field);
  const wholeRecord = g.field === '(whole record)';
  const label = wholeRecord ? '' : fieldLabel(project, sourceTable, sourceColumn, targetTable, targetColumn);
  const noun = tableNoun(sourceTable);
  return {
    signature: g.signature,
    severity: g.severity,
    level: SEVERITY_PLAIN[g.severity],
    area: g.serviceArea || '',
    text: issueSentence(g, label, noun),
    why: WHY[g.kind] || '',
    kind: g.kind,
  };
}

/**
 * @param {object} run       the run to summarise
 * @param {object[]} history every run up to and including this one, oldest first
 * @param {object} project   used only to look up everyday field names
 */
export function plainSummary(run, history = [run], project = null) {
  const s = run.summary;
  const groups = allGroups(run);
  const issues = groups.map(g => plainIssue(g, project));
  const { high, medium, low } = s.bySeverity;
  const smaller = medium + low;

  let status;
  if (high) {
    status = {
      level: 'attention',
      label: 'Needs attention',
      headline: `${num(high)} serious ${plural(high, 'issue')} to fix before this data can be relied on.`,
    };
  } else if (s.exceptions) {
    status = {
      level: 'nearly',
      label: 'Nearly there',
      headline: `No serious issues. ${num(smaller)} smaller ${plural(smaller, 'issue')} to tidy up.`,
    };
  } else {
    status = { level: 'clear', label: 'All clear', headline: 'Everything that was checked matched.' };
  }

  // Did everything arrive?
  const arrival = run.pairs.map(p => {
    const noun = tableNoun(p.sourceTable);
    const c = p.counts;
    const problems = [];
    if (c.missingInTarget) problems.push(`${num(c.missingInTarget)} did not arrive`);
    if (c.unexpectedInTarget) problems.push(`${num(c.unexpectedInTarget)} extra ${plural(c.unexpectedInTarget, 'record')} appeared`);
    if (c.duplicateTarget) problems.push(`${num(c.duplicateTarget)} ${plural(c.duplicateTarget, 'was', 'were')} loaded more than once`);
    if (c.blankKeySource + c.blankKeyTarget) problems.push(`${num(c.blankKeySource + c.blankKeyTarget)} had no reference and could not be checked`);
    const ok = problems.length === 0;
    return {
      ok,
      text: ok
        ? `All ${num(c.source)} ${noun} records arrived.`
        : `Of ${num(c.source)} ${noun} records: ${problems.join(', ')}.`,
    };
  });

  // Do the totals agree?
  const money = [];
  for (const p of run.pairs) {
    for (const f of p.fields) {
      if (f.totalUnreadable) {
        const u = f.totalUnreadable;
        const n = u.source + u.target;
        money.push({
          ok: false, unreadable: true,
          label: fieldLabel(project, p.sourceTable, f.sourceColumn, p.targetTable, f.targetColumn),
          oldTotal: 'not taken', newTotal: 'not taken',
          text: `No total taken: ${num(n)} ${plural(n, 'value')} could not be read as ${plural(n, 'an amount', 'amounts')}${u.example ? `, for example ${quote(u.example)}` : ''}.`,
        });
        continue;
      }
      if (!f.total) continue;
      const label = fieldLabel(project, p.sourceTable, f.sourceColumn, p.targetTable, f.targetColumn);
      const ok = f.total.diff === 0;
      money.push({
        ok,
        label,
        oldTotal: formatAmount(f.total.source),
        newTotal: formatAmount(f.total.target),
        text: ok
          ? 'The two systems agree exactly.'
          : `The new system is ${formatAmount(Math.abs(f.total.diff))} ${f.total.diff > 0 ? 'higher' : 'lower'} than the old one.`,
      });
    }
  }

  const matched = s.fieldsCompared ? Math.floor((s.fieldsMatched / s.fieldsCompared) * 1000) / 10 : null;
  const inShort = [
    `We compared ${num(s.recordsSource)} ${plural(s.recordsSource, 'record')} from the old system with what is now in the new system, checking ${num(s.fieldsCompared)} individual details.`,
    matched === null ? '' : s.fieldsMatched === s.fieldsCompared
      ? 'Every detail matched.'
      : `${matched.toFixed(1)}% of those details matched. ${num(s.fieldsCompared - s.fieldsMatched)} did not.`,
    !money.length ? 'No totals were added up in this check.'
      : money.some(m => m.unreadable) ? `${money.filter(m => m.unreadable).length === 1 ? 'One total' : `${money.filter(m => m.unreadable).length} totals`} could not be taken because some values could not be read as amounts.${money.some(m => !m.unreadable && !m.ok) ? ` ${money.filter(m => !m.unreadable && !m.ok).length} other ${plural(money.filter(m => !m.unreadable && !m.ok).length, 'total')} ${plural(money.filter(m => !m.unreadable && !m.ok).length, 'does', 'do')} not agree.` : ''}`
      : money.every(m => m.ok) ? `${money.length === 1 ? 'The total we added up agrees' : money.length === 2 ? 'Both totals we added up agree' : `All ${money.length} totals we added up agree`} between the two systems.`
        : `${money.filter(m => !m.ok).length} of ${money.length} ${plural(money.length, 'total')} we added up ${plural(money.filter(m => !m.ok).length, 'does', 'do')} not agree.`,
  ].filter(Boolean);

  // Progress since each area was last checked (like for like).
  const c = compareWithHistory(history, run);
  let progress = null;
  if (c.hasBaseline) {
    const before = c.previousTotal;
    const parts = [];
    if (before === 0) parts.push('The previous check found no issues.');
    else if (c.fixed.length === before) parts.push(`All ${num(before)} ${plural(before, 'issue')} found last time ${plural(before, 'has', 'have')} been fixed.`);
    else parts.push(`${num(c.fixed.length)} of the ${num(before)} ${plural(before, 'issue')} found last time ${plural(c.fixed.length, 'has', 'have')} been fixed. ${num(c.stillOpen.length)} ${plural(c.stillOpen.length, 'remains', 'remain')}.`);
    if (c.added.length) parts.push(`${num(c.added.length)} new ${plural(c.added.length, 'issue has', 'issues have')} appeared since then.`);
    if (c.firstTime.length) {
      const names = c.firstTime.map(t => tableNoun(t.split(' → ')[0]));
      parts.push(`This is the first check of the ${names.join(' and ')} records, so there is nothing to compare ${plural(names.length, 'it', 'them')} with yet.`);
    }
    progress = {
      previousLabel: c.singleLabel || 'the last check of the same records',
      fixed: c.fixed.length, stillOpen: c.stillOpen.length, added: c.added.length,
      text: parts.join(' '),
      newIssues: c.added.map(g => plainIssue(g, project).text),
    };
  }

  const trend = trendFor(history, run);

  const limits = [
    'This compares a file taken from the old system with a file taken from the new one. It does not look at screens, reports, letters or links to other systems.',
    ...run.notCovered.map(n => plainNotCovered(n)),
    'A clean result means the data that was checked matches. It is one piece of evidence for a go-live decision, not the decision itself.',
  ];

  return { status, inShort, arrival, money, issues, progress, trend, limits };
}

function plainNotCovered(note) {
  // "a → b: no extracts supplied, so this table was not checked."
  let m = /^(.+?) → (.+?): no extracts supplied/.exec(note);
  if (m) return `The ${tableNoun(m[1])} records were not included in this check.`;
  // "Table: 3 new-system fields with no mapping, so not checked (A, B, C)."
  m = /^(.+?): (\d+) new-system fields? with no mapping/.exec(note);
  if (m) return `${m[2]} ${plural(Number(m[2]), 'piece', 'pieces')} of information in the new system’s ${tableNoun(m[1])} area ${plural(Number(m[2]), 'has', 'have')} no agreed match in the old system, so ${plural(Number(m[2]), 'was', 'were')} not checked.`;
  return note;
}
