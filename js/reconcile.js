// Reconciliation engine.
//
// Compares an extract from the old system with an extract from the new system,
// using the agreed mappings as the rule book. Everything here is plain,
// repeatable logic: the same inputs always give the same result. No AI is
// involved in deciding whether a value matches.
//
// Row data is only ever held in memory while a check runs. The result that
// comes back contains counts, totals and a small number of example records
// per exception, with values masked for fields marked as personal.

const MAX_EXAMPLES = 5;
const MAX_KEYS_LISTED = 20;

export const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

export const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

// ---------- small helpers ----------

function str(v) {
  return v === null || v === undefined ? '' : String(v);
}

export function isBlank(v) {
  const s = str(v).trim();
  return s === '' || s.toLowerCase() === 'null';
}

const NUMERIC_RE = /^[-+]?(?:£|\$|€)?\s*(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/;

export function parseNumber(v) {
  const s = str(v).trim();
  if (s === '' || !/\d/.test(s)) return null;
  let neg = false;
  let body = s;
  // Accounting negatives: (123.45)
  const paren = /^\((.+)\)$/.exec(body);
  if (paren) { neg = true; body = paren[1].trim(); }
  // Ledger suffixes: 123.45 CR is a credit (negative), 123.45 DR a debit.
  const crdr = /^(.*?)\s*(CR|DR)$/i.exec(body);
  if (crdr) { if (crdr[2].toUpperCase() === 'CR') neg = !neg; body = crdr[1].trim(); }
  // Trailing minus: 123.45-
  const trail = /^(.*\d)\s*-$/.exec(body);
  if (trail && !/^[-+]/.test(body)) { neg = !neg; body = trail[1]; }
  // Sign after the currency symbol: £-1,234.50
  body = body.replace(/^([£$€])\s*([-+])/, '$2$1');
  if (!NUMERIC_RE.test(body)) return null;
  const n = Number(body.replace(/[£$€,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Returns YYYY-MM-DD, or null if the text is not a recognised date.
// Slashed and dashed day-first dates are read the UK way (DD/MM/YYYY).
export function parseDate(v) {
  const s = str(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?Z?)?$/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return null;
}

function validDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isDateType(type) {
  return /date|time/i.test(str(type));
}

function isNumericType(type) {
  return /int|dec|num|money|float|double|real|currency|amount/i.test(str(type));
}

function looksLikeIdentifier(name) {
  return /(^|_)(id|ref|key|code|no|number|num)$/i.test(str(name)) || /(_id|_ref|_code)$/i.test(str(name));
}

const PERSONAL_RE = /(fore|sur|first|last|given|family|full|contact|guardian|person|employee|pupil|staff)[ _]?name|(^|_)name($|_)|contact|dob|birth|address|addr|postcode|post_code|email|phone|mobile|tel(?:ephone)?|(^|_)ni(no|_number)?($|_)|national[ _]insurance|bank|sort[ _]?code|account[ _]?(no|num|number)|iban|upn|nhs|salary|gender|ethnic|disab|medical|health|(^|_)title($|_)|salutation|honorific|marital|religio|faith|belief|sexual|orientation|(^|_)sen($|_)|special[ _]?(educational[ _]?)?needs|ehcp|(^|_)fsm($|_)|free[ _]?school[ _]?meal|pupil[ _]?premium|safeguard|child[ _]?protection|(^|_)cp[ _]?(flag|status|plan)|looked[ _]?after|(^|_)lac($|_)|care[ _]?leaver|criminal|offen[cd]|conviction|immigration|nationality|trade[ _]?union|biometric|pregnan|maternity/i;

const AMOUNT_NAME_RE = /amount|balance|total|value|price|cost|net|gross|vat|tax|debit|credit|paid|due|budget|spend|salary|pay$|hours|qty|quantity|units|fte|headcount|volume|weight|sessions|attendances|absences/i;

// A first guess at whether a field is a quantity worth adding up as a control
// total: money, but also hours, headcounts, quantities and the like. A person confirms or overrides this before each run.
export function isLikelyAmount(mapping, sCol, tCol) {
  if (!isBlank(mapping.lookupRule)) return false;
  if (looksLikeIdentifier(mapping.sourceColumn) || looksLikeIdentifier(mapping.targetColumn)) return false;
  const moneyType = /dec|num|money|float|double|real|currency|amount/i;
  if (moneyType.test(str(sCol?.type)) || moneyType.test(str(tCol?.type))) return true;
  return (isNumericType(sCol?.type) || isNumericType(tCol?.type))
    && (AMOUNT_NAME_RE.test(str(mapping.sourceColumn)) || AMOUNT_NAME_RE.test(str(mapping.targetColumn)));
}

// A first guess at whether a field holds personal data, from its name and
// description. It includes the special categories under UK GDPR (health,
// religion, sexual orientation and so on) and sensitive schools data such as
// SEN, free school meals and safeguarding. A person confirms or overrides this before each run.
export function isLikelyPersonal(col) {
  if (!col) return false;
  return PERSONAL_RE.test(str(col.name)) || PERSONAL_RE.test(str(col.description));
}

export function maskValue(v) {
  const s = str(v);
  if (isBlank(s)) return '(blank)';
  return `${'•'.repeat(Math.min(s.trim().length, 8))} (${s.trim().length} chars)`;
}

function showValue(v) {
  return isBlank(v) ? '(blank)' : str(v).trim();
}

// ---------- mapping helpers ----------

// "1 -> Y, 0 -> N" (also =>, and ; or new lines as separators)
export function parseLookupRule(rule) {
  const map = new Map();
  const unparsed = [];
  for (const line of str(rule).split(/[,;\n]/).map(l => l.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[-=]>\s*(.+)$/.exec(line);
    if (m) map.set(m[1].trim(), m[2].trim());
    else unparsed.push(line);
  }
  return { map, unparsed };
}

// Group mappings into old-table -> new-table pairs.
export function tablePairs(mappings) {
  const pairs = new Map();
  for (const m of mappings || []) {
    const id = `${m.sourceTable}→${m.targetTable}`;
    if (!pairs.has(id)) {
      pairs.set(id, { id, sourceTable: m.sourceTable, targetTable: m.targetTable, mappings: [] });
    }
    pairs.get(id).mappings.push(m);
  }
  return [...pairs.values()];
}

export function getColumn(schema, tableName, columnName) {
  return schema?.tables?.find(t => t.name === tableName)?.columns?.find(c => c.name === columnName) || null;
}

// Best guess at which mapped field identifies a record.
export function guessKeyMappingIds(pair) {
  const byScore = pair.mappings
    .map((m, i) => {
      const n = str(m.sourceColumn).toLowerCase();
      let score = 0;
      if (/(^|_)id$/.test(n)) score = 3;
      else if (/(^|_)(ref|key|no|number)$/.test(n)) score = 2;
      else if (/code$/.test(n)) score = 1;
      return { m, i, score };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return byScore.length && byScore[0].score > 0 ? [byScore[0].m.id] : [];
}

/**
 * When the guessed key repeats in the old extract, find the smallest set of
 * matched fields (up to three) whose values pick out every record exactly once.
 * Amounts are never used as keys. Returns mapping ids, or null if none works.
 */
export function suggestKeyMappingIds(pair, sourceRows, { maxFields = 3, maxCandidates = 10 } = {}) {
  if (!sourceRows?.length) return null;
  const cols = new Set(Object.keys(sourceRows[0]));
  const guess = new Set(guessKeyMappingIds(pair));
  const candidates = pair.mappings
    .filter(m => cols.has(m.sourceColumn))
    .map(m => {
      const values = new Set();
      let blanks = 0;
      let money = 0;
      for (const r of sourceRows) {
        const v = str(r[m.sourceColumn]).trim();
        if (v === '') { blanks++; continue; }
        values.add(v);
        if (/^[-+(]?[£$€]?[\d,]*\.\d{1,4}\)?$/.test(v)) money++;
      }
      const filled = sourceRows.length - blanks;
      return { m, distinct: values.size, blanks, amount: filled > 0 && money / filled >= 0.8 };
    })
    // Amounts are never keys; neither are fields with blanks or only one value.
    .filter(c => c.distinct > 1 && c.blanks === 0 && !c.amount)
    .sort((a, b) => (guess.has(b.m.id) - guess.has(a.m.id)) || b.distinct - a.distinct)
    .slice(0, maxCandidates);
  const unique = combo => {
    const seen = new Set();
    for (const r of sourceRows) {
      const k = combo.map(c => str(r[c.m.sourceColumn]).trim()).join('\u241f');
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  };
  const combos = (arr, k, start = 0, acc = [], out = []) => {
    if (acc.length === k) { out.push([...acc]); return out; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); combos(arr, k, i + 1, acc, out); acc.pop(); }
    return out;
  };
  for (let k = 1; k <= Math.min(maxFields, candidates.length); k++) {
    const options = combos(candidates, k)
      .sort((a, b) => b.filter(c => guess.has(c.m.id)).length - a.filter(c => guess.has(c.m.id)).length);
    for (const combo of options) if (unique(combo)) return combo.map(c => c.m.id);
  }
  return null;
}

// A short stamp of a table pair's mapping rules. Stored with each check so a
// later change to the mappings can be detected.
export function mappingStamp(pair) {
  const rules = pair.mappings
    .map(m => [m.sourceColumn, m.targetColumn, str(m.lookupRule).trim(), str(m.defaultValue).trim()].join('\u241f'))
    .sort()
    .join('\u241e');
  let h = 5381;
  for (let i = 0; i < rules.length; i++) h = ((h << 5) + h + rules.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

// ---------- value comparison ----------

// Returns 'exact' | 'format' | 'case' | 'diff'
//   exact  - identical text
//   format - same value written differently (spacing, 100 vs 100.00, date layout)
//   case   - differs only by upper/lower case
//   diff   - different value
export function compareValues(expected, actual, { sourceType, targetType } = {}) {
  const e = str(expected);
  const a = str(actual);
  if (e === a) return 'exact';
  if (isBlank(e) && isBlank(a)) return 'format';
  if (isBlank(e) || isBlank(a)) return 'diff';
  const et = e.trim();
  const at = a.trim();
  if (et === at) return 'format';

  if (isDateType(sourceType) || isDateType(targetType)) {
    const ed = parseDate(et);
    const ad = parseDate(at);
    if (ed && ad) return ed === ad ? 'format' : 'diff';
  }

  const en = parseNumber(et);
  const an = parseNumber(at);
  if (en !== null && an !== null) {
    // Leading zeros matter for codes: "007" is not the same as "7".
    const codeLike = /^0\d/.test(et) || /^0\d/.test(at);
    if (!codeLike) return Math.abs(en - an) < 1e-9 ? 'format' : 'diff';
  }

  const ed = parseDate(et);
  const ad = parseDate(at);
  if (ed && ad && ed === ad) return 'format';

  if (et.toLowerCase() === at.toLowerCase()) return 'case';
  return 'diff';
}

// ---------- the check itself ----------

function buildKey(row, columns) {
  const parts = columns.map(c => str(row[c]).trim());
  if (parts.some(p => p === '' || p.toLowerCase() === 'null')) return null;
  return parts.join(' | ');
}

function indexRows(rows, keyColumns) {
  const byKey = new Map();
  const duplicates = new Map();
  let blankKeys = 0;
  for (const row of rows) {
    const key = buildKey(row, keyColumns);
    if (key === null) { blankKeys++; continue; }
    if (byKey.has(key)) duplicates.set(key, (duplicates.get(key) || 1) + 1);
    else byKey.set(key, row);
  }
  return { byKey, duplicates, blankKeys };
}

function addToSum(total, v) {
  const n = parseNumber(v);
  if (n === null) return total;
  // Work in ten-thousandths to avoid floating point drift on money.
  return total + Math.round(n * 10000);
}

class GroupCollector {
  constructor() { this.groups = new Map(); }

  add({ signature, severity, kind, field, title, serviceArea = '', key, example }) {
    let g = this.groups.get(signature);
    if (!g) {
      g = { signature, severity, kind, field, title, serviceArea, count: 0, sampleKeys: [], examples: [] };
      this.groups.set(signature, g);
    }
    g.count++;
    if (key !== undefined && g.sampleKeys.length < MAX_KEYS_LISTED) g.sampleKeys.push(key);
    if (example && g.examples.length < MAX_EXAMPLES) g.examples.push(example);
    return g;
  }

  list() {
    return [...this.groups.values()].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.signature.localeCompare(b.signature)
    );
  }
}

/**
 * Reconcile one old-table -> new-table pair.
 *
 * @param {object} args
 * @param {object} args.pair           from tablePairs()
 * @param {object[]} args.sourceRows   rows from the old system extract (objects keyed by column name)
 * @param {object[]} args.targetRows   rows from the new system extract
 * @param {string[]} args.keyMappingIds mapping ids whose fields together identify a record
 * @param {object} [args.sourceSchema]
 * @param {object} [args.targetSchema]
 * @param {string[]} [args.maskedMappingIds] mappings whose values must be masked in the result
 * @param {string[]} [args.totalMappingIds]  mappings to add up as control totals (default: a guess from type and name)
 * @param {string} [args.sourceFile]
 * @param {string} [args.targetFile]
 */
export function reconcilePair({
  pair, sourceRows, targetRows, keyMappingIds,
  sourceSchema = null, targetSchema = null,
  maskedMappingIds = [], totalMappingIds = null, sourceFile = '', targetFile = '',
}) {
  const masked = new Set(maskedMappingIds);
  const groups = new GroupCollector();
  const pairLabel = `${pair.sourceTable} → ${pair.targetTable}`;

  const keyMappings = pair.mappings.filter(m => keyMappingIds.includes(m.id));
  if (!keyMappings.length) throw new Error(`Choose at least one key field for ${pairLabel}.`);

  const sourceCols = new Set(sourceRows.length ? Object.keys(sourceRows[0]) : []);
  const targetCols = new Set(targetRows.length ? Object.keys(targetRows[0]) : []);

  for (const km of keyMappings) {
    if (sourceRows.length && !sourceCols.has(km.sourceColumn)) {
      throw new Error(`The key field "${km.sourceColumn}" is not in the old system's file for ${pairLabel}.`);
    }
    if (targetRows.length && !targetCols.has(km.targetColumn)) {
      throw new Error(`The key field "${km.targetColumn}" is not in the new system's file for ${pairLabel}.`);
    }
  }

  const src = indexRows(sourceRows, keyMappings.map(m => m.sourceColumn));
  const tgt = indexRows(targetRows, keyMappings.map(m => m.targetColumn));

  // ----- record level -----
  const missingInTarget = [];
  const unexpectedInTarget = [];
  for (const key of src.byKey.keys()) if (!tgt.byKey.has(key)) missingInTarget.push(key);
  for (const key of tgt.byKey.keys()) if (!src.byKey.has(key)) unexpectedInTarget.push(key);

  for (const key of missingInTarget) {
    groups.add({
      signature: `${pair.id}::missing_record`, severity: 'high', kind: 'missing_record', field: '(whole record)',
      title: 'Records in the old system are missing from the new system', key,
    });
  }
  for (const key of unexpectedInTarget) {
    groups.add({
      signature: `${pair.id}::unexpected_record`, severity: 'high', kind: 'unexpected_record', field: '(whole record)',
      title: 'Records in the new system have no matching record in the old system', key,
    });
  }
  for (const [key, n] of tgt.duplicates) {
    groups.add({
      signature: `${pair.id}::duplicate_target`, severity: 'high', kind: 'duplicate_target', field: '(whole record)',
      title: 'The same record appears more than once in the new system', key: `${key} (×${n})`,
    });
  }
  for (const [key, n] of src.duplicates) {
    groups.add({
      signature: `${pair.id}::duplicate_source`, severity: 'medium', kind: 'duplicate_source', field: '(whole record)',
      title: 'The same record appears more than once in the old system extract', key: `${key} (×${n})`,
    });
  }
  if (src.blankKeys) {
    const g = groups.add({
      signature: `${pair.id}::blank_key_source`, severity: 'medium', kind: 'blank_key', field: '(whole record)',
      title: 'Records in the old system extract have a blank key and could not be compared',
    });
    g.count = src.blankKeys;
  }
  if (tgt.blankKeys) {
    const g = groups.add({
      signature: `${pair.id}::blank_key_target`, severity: 'high', kind: 'blank_key', field: '(whole record)',
      title: 'Records in the new system extract have a blank key and could not be compared',
    });
    g.count = tgt.blankKeys;
  }

  const matchedKeys = [];
  for (const key of src.byKey.keys()) if (tgt.byKey.has(key)) matchedKeys.push(key);

  // ----- field level -----
  const fields = [];
  let fieldsCompared = 0;
  let fieldsMatched = 0;

  for (const m of pair.mappings) {
    const isKey = keyMappingIds.includes(m.id);
    const sCol = getColumn(sourceSchema, m.sourceTable, m.sourceColumn);
    const tCol = getColumn(targetSchema, m.targetTable, m.targetColumn);
    const fieldLabel = `${m.sourceColumn} → ${m.targetColumn}`;
    const isMasked = masked.has(m.id);
    const show = v => (isMasked ? maskValue(v) : showValue(v));

    const f = {
      mappingId: m.id, sourceColumn: m.sourceColumn, targetColumn: m.targetColumn,
      serviceArea: m.serviceArea || '', isKey, masked: isMasked,
      compared: 0, matched: 0, mismatched: 0, formatOnly: 0,
      total: null, totalSkipped: '', skipped: '',
    };

    if (sourceRows.length && !sourceCols.has(m.sourceColumn)) f.skipped = 'This field is not in the old system\'s file';
    else if (targetRows.length && !targetCols.has(m.targetColumn)) f.skipped = 'This field is not in the new system\'s file';

    if (f.skipped) {
      groups.add({
        signature: `${pair.id}::${m.id}::not_checked`, severity: 'medium', kind: 'not_checked', field: fieldLabel,
        serviceArea: f.serviceArea, title: `Not checked: ${f.skipped.toLowerCase()}`,
      });
      fields.push(f);
      continue;
    }

    const lookup = parseLookupRule(m.lookupRule);
    const hasLookup = lookup.map.size > 0;
    const hasDefault = !isBlank(m.defaultValue);
    const required = tCol?.required === true;

    for (const key of matchedKeys) {
      const sRow = src.byKey.get(key);
      const tRow = tgt.byKey.get(key);
      const sVal = sRow[m.sourceColumn];
      const tVal = tRow[m.targetColumn];
      const sTrim = str(sVal).trim();

      let expected = sVal;
      let noRule = false;
      if (isBlank(sVal)) {
        expected = hasDefault ? m.defaultValue : '';
      } else if (hasLookup) {
        if (lookup.map.has(sTrim)) expected = lookup.map.get(sTrim);
        else noRule = true;
      }

      f.compared++;
      const outcome = compareValues(expected, tVal, { sourceType: sCol?.type, targetType: tCol?.type });

      if (noRule) {
        // A code with no agreed translation is an exception whatever landed in the new system.
        f.mismatched++;
        const passedThrough = outcome === 'exact' || outcome === 'format';
        groups.add({
          signature: `${pair.id}::${m.id}::no_rule::${sTrim}::${passedThrough ? '=' : str(tVal).trim()}`,
          severity: passedThrough ? 'medium' : 'high', kind: 'no_translation_rule', field: fieldLabel, serviceArea: f.serviceArea,
          title: passedThrough
            ? `Old value "${show(sVal)}" has no agreed translation and was copied across unchanged`
            : `Old value "${show(sVal)}" has no agreed translation; the new system holds "${show(tVal)}"`,
          key, example: { key, source: show(sVal), expected: '(no rule)', actual: show(tVal) },
        });
        continue;
      }

      if (outcome === 'exact') { f.matched++; continue; }
      if (outcome === 'format') { f.matched++; f.formatOnly++; continue; }

      f.mismatched++;
      const example = { key, source: show(sVal), expected: show(expected), actual: show(tVal) };
      const base = `${pair.id}::${m.id}`;

      if (outcome === 'case') {
        groups.add({
          signature: `${base}::case`, severity: 'low', kind: 'case_only', field: fieldLabel, serviceArea: f.serviceArea,
          title: 'Value differs only by upper or lower case', key, example,
        });
      } else if (isBlank(tVal)) {
        groups.add({
          signature: `${base}::blank_in_target`, severity: required || isKey ? 'high' : 'medium', kind: 'blank_in_target',
          field: fieldLabel, serviceArea: f.serviceArea,
          title: required ? 'Required field is blank in the new system' : 'Value is blank in the new system', key, example,
        });
      } else if (isBlank(expected)) {
        groups.add({
          signature: `${base}::unexpected_value`, severity: 'medium', kind: 'unexpected_value', field: fieldLabel,
          serviceArea: f.serviceArea, title: 'New system holds a value where the old system was blank', key, example,
        });
      } else if (hasLookup && lookup.map.has(sTrim)) {
        groups.add({
          signature: `${base}::wrong_translation::${sTrim}::${str(tVal).trim()}`, severity: 'high', kind: 'wrong_translation',
          field: fieldLabel, serviceArea: f.serviceArea,
          title: `Old value "${show(sVal)}" should become "${show(expected)}" but the new system holds "${show(tVal)}"`,
          key, example,
        });
      } else if (str(expected).trim().length > str(tVal).trim().length && str(expected).trim().startsWith(str(tVal).trim())) {
        groups.add({
          signature: `${base}::truncated::${str(tVal).trim().length}`, severity: 'medium', kind: 'truncated', field: fieldLabel,
          serviceArea: f.serviceArea,
          title: `Value has been cut short in the new system (at ${str(tVal).trim().length} characters)`, key, example,
        });
      } else {
        groups.add({
          signature: `${base}::value_differs`, severity: 'medium', kind: 'value_differs', field: fieldLabel,
          serviceArea: f.serviceArea, title: 'Value in the new system differs from the old system', key, example,
        });
      }
    }

    // ----- control totals for amount fields -----
    // Totals cover every row in each extract, not just the matched ones, so a
    // missing or extra record shows up in the total as well.
    const wantTotal = totalMappingIds ? totalMappingIds.includes(m.id) : isLikelyAmount(m, sCol, tCol);
    const canTotal = allNumeric(sourceRows, m.sourceColumn) && allNumeric(targetRows, m.targetColumn);
    if (wantTotal && !canTotal) {
      f.totalSkipped = 'Not every value is a number, so no total was taken';
      // A money field with a few unreadable values must not lose its total quietly.
      const su = unreadable(sourceRows, m.sourceColumn);
      const tu = unreadable(targetRows, m.targetColumn);
      if ((su.count || tu.count) && su.share >= 0.9 && tu.share >= 0.9) {
        const example = isMasked ? '' : (tu.examples[0] ?? su.examples[0] ?? '');
        f.totalUnreadable = { source: su.count, target: tu.count, example };
        const n = su.count + tu.count;
        f.totalSkipped = `No total taken: ${n} ${n === 1 ? 'value' : 'values'} could not be read as ${n === 1 ? 'an amount' : 'amounts'}`;
        const g = groups.add({
          signature: `${pair.id}::${m.id}::total_unreadable`, severity: 'high', kind: 'total_unreadable', field: fieldLabel,
          serviceArea: f.serviceArea,
          title: `No total taken: ${n} ${n === 1 ? 'value' : 'values'} could not be read as ${n === 1 ? 'an amount' : 'amounts'} (old file ${su.count}, new file ${tu.count})${example ? `, for example "${example}"` : ''}`,
        });
        g.count = n;
        g.unreadable = { source: su.count, target: tu.count, example };
      }
    }

    if (wantTotal && canTotal && !isKey) {
      let s = 0;
      let t = 0;
      for (const row of sourceRows) s = addToSum(s, row[m.sourceColumn]);
      for (const row of targetRows) t = addToSum(t, row[m.targetColumn]);
      f.total = { source: s / 10000, target: t / 10000, diff: (t - s) / 10000 };
      if (s !== t) {
        groups.add({
          signature: `${pair.id}::${m.id}::total_differs`, severity: 'high', kind: 'total_differs', field: fieldLabel,
          serviceArea: f.serviceArea,
          title: `Total differs by ${formatAmount(f.total.diff)} (old ${formatAmount(f.total.source)}, new ${formatAmount(f.total.target)})`,
        });
      }
    }

    fieldsCompared += f.compared;
    fieldsMatched += f.matched;
    fields.push(f);
  }

  return {
    id: pair.id,
    sourceTable: pair.sourceTable,
    targetTable: pair.targetTable,
    sourceFile, targetFile,
    mappingStamp: mappingStamp(pair),
    key: { source: keyMappings.map(m => m.sourceColumn), target: keyMappings.map(m => m.targetColumn) },
    counts: {
      source: sourceRows.length, target: targetRows.length, matched: matchedKeys.length,
      missingInTarget: missingInTarget.length, unexpectedInTarget: unexpectedInTarget.length,
      duplicateSource: src.duplicates.size, duplicateTarget: tgt.duplicates.size,
      blankKeySource: src.blankKeys, blankKeyTarget: tgt.blankKeys,
    },
    fieldsCompared, fieldsMatched,
    fields,
    groups: groups.list(),
  };
}

function unreadable(rows, column) {
  let filled = 0; let count = 0; const examples = [];
  for (const row of rows) {
    const v = row[column];
    if (isBlank(v)) continue;
    filled++;
    if (parseNumber(v) === null) { count++; if (examples.length < 3) examples.push(str(v).trim()); }
  }
  return { count, examples, share: filled ? (filled - count) / filled : 0 };
}

function allNumeric(rows, column) {
  let seen = 0;
  for (const row of rows) {
    const v = row[column];
    if (isBlank(v)) continue;
    if (parseNumber(v) === null) return false;
    seen++;
  }
  return seen > 0;
}

export function formatAmount(n) {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- a run = one trial load checked ----------

export function summarise(pairResults) {
  const s = {
    tables: pairResults.length,
    recordsSource: 0, recordsTarget: 0, recordsMatched: 0,
    fieldsCompared: 0, fieldsMatched: 0,
    exceptions: 0, recordsAffected: 0,
    bySeverity: { high: 0, medium: 0, low: 0 },
    totalsChecked: 0, totalsAgreed: 0,
  };
  for (const p of pairResults) {
    s.recordsSource += p.counts.source;
    s.recordsTarget += p.counts.target;
    s.recordsMatched += p.counts.matched;
    s.fieldsCompared += p.fieldsCompared;
    s.fieldsMatched += p.fieldsMatched;
    for (const f of p.fields) {
      if (f.total) {
        s.totalsChecked++;
        if (f.total.diff === 0) s.totalsAgreed++;
      }
    }
    for (const g of p.groups) {
      s.exceptions++;
      s.recordsAffected += g.count;
      s.bySeverity[g.severity]++;
    }
  }
  s.matchRate = s.fieldsCompared ? s.fieldsMatched / s.fieldsCompared : null;
  return s;
}

export function buildRun({ project, label, by, pairResults, notCovered = [], at = new Date().toISOString(), id }) {
  return {
    id: id || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now())),
    label: label || 'Trial load',
    at,
    by: by || 'unknown',
    project: { name: project.name, sourceSystem: project.sourceSystem, targetSystem: project.targetSystem },
    mappingCount: project.mappings?.length || 0,
    pairs: pairResults,
    notCovered,
    summary: summarise(pairResults),
    reviews: [],
    fingerprint: '',
  };
}

// A SHA-256 fingerprint of the results. If anything in the results is changed
// after the run, the fingerprint no longer matches.
export async function fingerprintRun(run) {
  const { reviews, fingerprint, ...content } = run;
  const bytes = new TextEncoder().encode(stableStringify(content));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function allGroups(run) {
  const out = [];
  for (const p of run.pairs) {
    for (const g of p.groups) out.push({ ...g, table: `${p.sourceTable} → ${p.targetTable}` });
  }
  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.signature.localeCompare(b.signature)
  );
}

// What changed since each table was last checked.
//
// A run may cover only some tables (one module at a time), so each table in
// the current run is compared with the most recent earlier run that also
// checked that table. Tables never checked before have no baseline and are
// listed under firstTime.
//
// @param {object[]} history every run, oldest first, including `current`
// Test loads are compared with test loads, and live loads with live loads.
const sameStage = (history, current) => history.filter(r => (r.stage === 'live') === (current.stage === 'live'));

export function compareWithHistory(history, current) {
  history = sameStage(history, current);
  const index = history.findIndex(r => r.id === current.id);
  const earlier = (index < 0 ? history : history.slice(0, index)).slice().reverse();
  const fixed = [];
  const stillOpen = [];
  const added = [];
  const baselines = [];
  const firstTime = [];
  let previousTotal = 0;

  for (const pair of current.pairs) {
    const table = `${pair.sourceTable} → ${pair.targetTable}`;
    const baseRun = earlier.find(r => r.pairs.some(p => p.id === pair.id));
    if (!baseRun) { firstTime.push(table); continue; }
    const basePair = baseRun.pairs.find(p => p.id === pair.id);
    baselines.push({ table, runId: baseRun.id, label: baseRun.label, at: baseRun.at });
    previousTotal += basePair.groups.length;
    const prev = new Map(basePair.groups.map(g => [g.signature, g]));
    const curr = new Map(pair.groups.map(g => [g.signature, g]));
    for (const [sig, g] of prev) if (!curr.has(sig)) fixed.push({ ...g, table });
    for (const [sig, g] of curr) {
      if (prev.has(sig)) stillOpen.push({ ...g, table, previousCount: prev.get(sig).count });
      else added.push({ ...g, table });
    }
  }

  const bySeverity = (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count;
  const labels = [...new Set(baselines.map(b => b.label))];
  return {
    hasBaseline: baselines.length > 0,
    fixed: fixed.sort(bySeverity), stillOpen: stillOpen.sort(bySeverity), added: added.sort(bySeverity),
    baselines, firstTime, previousTotal,
    // One label if every table was last checked in the same run, otherwise null.
    singleLabel: labels.length === 1 ? labels[0] : null,
  };
}

// Issue counts over time for the tables in `current` only, so the trend is
// like for like even when earlier runs covered other tables.
export function trendFor(history, current) {
  history = sameStage(history, current);
  const ids = new Set(current.pairs.map(p => p.id));
  const index = history.findIndex(r => r.id === current.id);
  const upTo = index < 0 ? [...history, current] : history.slice(0, index + 1);
  const out = [];
  for (const r of upTo) {
    const pairs = r.pairs.filter(p => ids.has(p.id));
    if (!pairs.length) continue;
    let serious = 0;
    let other = 0;
    for (const p of pairs) for (const g of p.groups) (g.severity === 'high' ? serious++ : other++);
    out.push({
      label: r.label, serious, other, total: serious + other, current: r.id === current.id,
      partial: pairs.length < ids.size,
    });
  }
  return out;
}

// What changed between two specific runs, whatever they covered.
export function compareRuns(previous, current) {
  const prev = new Map(allGroups(previous).map(g => [g.signature, g]));
  const curr = new Map(allGroups(current).map(g => [g.signature, g]));
  const fixed = [];
  const stillOpen = [];
  const added = [];
  for (const [sig, g] of prev) if (!curr.has(sig)) fixed.push(g);
  for (const [sig, g] of curr) {
    if (prev.has(sig)) stillOpen.push({ ...g, previousCount: prev.get(sig).count });
    else added.push(g);
  }
  return { fixed, stillOpen, added };
}

export function exceptionRows(run) {
  return allGroups(run).map(g => ({
    severity: SEVERITY_LABEL[g.severity],
    table: g.table,
    field: g.field,
    service_area: g.serviceArea || '',
    finding: g.title,
    records_affected: g.kind === 'total_differs' || g.kind === 'not_checked' ? '' : g.count,
    example_records: g.sampleKeys.slice(0, 10).join('; '),
  }));
}
