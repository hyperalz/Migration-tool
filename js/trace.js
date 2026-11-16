// Tracing known records: link the labels read from screenshots to the real
// tables and columns of the old system's database.
//
// MapBridge cannot reach the database, and must not see record values. So:
// 1. MapBridge writes a read-only SQL Server script with one blank per label.
// 2. Someone types the values shown on a screenshot into the blanks, on their
//    own machine, and runs the script against (a copy of) the database.
// 3. The script returns only table and column names with row counts, never
//    values. That result file is added back here.
// 4. Results from several records are combined. A person confirms each link.
//
// No AI is involved anywhere in this file, and nothing here passes or fails
// anything: it only suggests links for a person to confirm.

import { SCREEN_PREFIX } from './screenshot-dictionary.js';

export const TRACE_TEXT = {
  title: 'Link the screen names to the real fields',
  lead: 'Find which table and field in the database holds each name from the screenshots. You do this by looking up one record you know.',
  step1: 'Pick a screen and download its search script.',
  step2: 'Open the script on the computer that can reach the old database. Type the values from the screenshot of one record between the quotes.',
  step3: 'Run the script on a copy of the database, or out of hours. Save the results as a CSV file.',
  step4: 'Add the results file here. Check each link, tick it and press Link.',
  empty: 'Add names from pictures of the old system first, in the box above. Then you can link them to the real fields here.',
  privacy: 'The values you type stay on your computer. The results file holds only table names, field names and counts. Delete the filled-in script when you are done.',
  severalHelp: 'Some names were found in more than one place. Run the script again with a second record. MapBridge keeps only the places that match every time.',
  nextStep: 'Run the script again with another record for the names that are not linked yet. Then match the linked fields on the Match screen.',
};

export const STATUS = {
  one: 'Found in one place',
  likely: 'Probably this one',
  several: 'Found in more than one place',
  conflict: 'No place matched every record',
  none: 'Not found',
  skipped: 'Not looked for',
};

// Yes/no values ("Y", "1", "True") are in thousands of rows of most tables,
// so a search for them says nothing. They are left out of the script.
export const SEARCHABLE = new Set(['text', 'pick-list', 'date', 'number']);

const sqlText = v => `N'${String(v ?? '').replace(/'/g, "''")}'`;
const sqlComment = v => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /');

export function screenTables(sourceSchema) {
  return (sourceSchema?.tables || []).filter(t => t.origin === 'screenshot' || String(t.name).startsWith(SCREEN_PREFIX));
}

export const screenLabel = name => String(name).startsWith(SCREEN_PREFIX) ? String(name).slice(SCREEN_PREFIX.length) : String(name);

/**
 * A read-only SQL Server script that searches the database for the values
 * typed into it, and returns where they were found. Never returns values.
 * @param {{name:string, columns:{name:string,type:string,link?:object}[]}[]} screens
 * @param {{project?:string, onlyUnlinked?:boolean}} [opts]
 */
export function buildTraceScript(screens, { project = '', onlyUnlinked = true } = {}) {
  const rows = [];
  const skipped = [];
  for (const s of screens) {
    for (const c of s.columns || []) {
      if (onlyUnlinked && c.link) continue;
      const kind = c.type || 'text';
      if (!SEARCHABLE.has(kind)) { skipped.push({ screen: screenLabel(s.name), label: c.name, kind }); continue; }
      rows.push({ screen: screenLabel(s.name), label: c.name, kind });
    }
  }
  if (!rows.length) throw new Error('There are no names left to look for on this screen.');

  // SQL Server takes at most 1,000 rows in one INSERT ... VALUES, so split.
  const chunks = [];
  for (let i = 0; i < rows.length; i += 900) chunks.push(rows.slice(i, i + 900));
  const values = chunks.map((chunk, k) => 'INSERT INTO #mb_labels (id, screen, label, kind, value) VALUES\n' + chunk.map((r, j) => {
    const id = k * 900 + j + 1;
    return `  (${id}, ${sqlText(r.screen)}, ${sqlText(r.label)}, '${r.kind}', N'')${j < chunk.length - 1 ? ',' : ';'}`;
  }).join('\n')).join('\n\n');

  return `/*
  MapBridge search script${project ? ` for ${sqlComment(project)}` : ''}
  Made ${new Date().toISOString().slice(0, 10)}. Screens: ${sqlComment([...new Set(rows.map(r => r.screen))].join(', '))}

  WHAT IT DOES
  Looks for the values you type below in every table of this database, and
  lists the tables and columns where each value was found, with a count of
  rows. It never lists the values themselves. It only reads: it does not
  change any data, and it removes its own temporary tables when it ends.

  HOW TO USE IT
  1. Open the screenshot of one record. For each line below, type the value
     the screen shows between the quotes in N''. Leave a line empty if the
     screen shows nothing for it.
     Dates: type them as shown, for example 01/02/2014 (day/month/year).
     An apostrophe must be typed twice: O''Brien.
  2. Run the script against a COPY of the database, or out of hours. It reads
     every table, which can take a while on a big database.
  3. In the results grid, right-click > Save Results As... > CSV.
  4. Add that CSV file to MapBridge. Then delete this filled-in script: it
     now holds a person's details.

  Needs SQL Server 2012 or later. Uses READ UNCOMMITTED so it does not
  block other users; on a busy live system the counts may be slightly off.
*/
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

IF OBJECT_ID('tempdb..#mb_labels') IS NOT NULL DROP TABLE #mb_labels;
CREATE TABLE #mb_labels (id int PRIMARY KEY, screen nvarchar(200), label nvarchar(200), kind varchar(20), value nvarchar(4000));

-- Type each value between the quotes at the END of its line: N''  ->  N'Zedwick'
${values}
${skipped.length ? `\n-- Not looked for (yes/no values are in too many rows to tell anything):\n${skipped.map(s => `--   ${sqlComment(s.screen)}: ${sqlComment(s.label)}`).join('\n')}\n` : ''}
-- ===================== nothing to change below this line =====================

UPDATE #mb_labels SET value = LTRIM(RTRIM(value));
DELETE FROM #mb_labels WHERE value = N'';
IF NOT EXISTS (SELECT 1 FROM #mb_labels)
BEGIN
  RAISERROR(N'No values were typed in, so there is nothing to look for.', 16, 1);
  RETURN;
END;

IF OBJECT_ID('tempdb..#mb_found') IS NOT NULL DROP TABLE #mb_found;
CREATE TABLE #mb_found (id int, table_name nvarchar(300), column_name nvarchar(128), matching_rows int);

-- Each value as a variable, in text, date and number form, for the searches below.
DECLARE @decl nvarchar(max) = N'', @id int;
DECLARE label_cur CURSOR LOCAL FAST_FORWARD FOR SELECT id FROM #mb_labels ORDER BY id;
OPEN label_cur;
FETCH NEXT FROM label_cur INTO @id;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @decl = @decl
    + N'DECLARE @v' + CAST(@id AS nvarchar(10)) + N' nvarchar(4000) = (SELECT value FROM #mb_labels WHERE id = ' + CAST(@id AS nvarchar(10)) + N');'
    + N'DECLARE @d' + CAST(@id AS nvarchar(10)) + N' date = TRY_CONVERT(date, @v' + CAST(@id AS nvarchar(10)) + N', 103);'
    + N'DECLARE @n' + CAST(@id AS nvarchar(10)) + N' decimal(38,10) = TRY_CONVERT(decimal(38,10), REPLACE(REPLACE(@v' + CAST(@id AS nvarchar(10)) + N', N'','', N''''), N''£'', N''''));'
    + NCHAR(10);
  FETCH NEXT FROM label_cur INTO @id;
END;
CLOSE label_cur; DEALLOCATE label_cur;

-- One pass over each table, counting matches for every label and column at once.
DECLARE @object_id int, @table nvarchar(300), @table_q nvarchar(300);
DECLARE @col sysname, @type sysname, @kind varchar(20), @cond nvarchar(max);
DECLARE @sums nvarchar(max), @map nvarchar(max), @pairs int, @sql nvarchar(max);

DECLARE table_cur CURSOR LOCAL FAST_FORWARD FOR
  SELECT t.object_id, s.name + N'.' + t.name, QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE t.is_ms_shipped = 0
  ORDER BY s.name, t.name;
OPEN table_cur;
FETCH NEXT FROM table_cur INTO @object_id, @table, @table_q;
WHILE @@FETCH_STATUS = 0
BEGIN
  RAISERROR(N'Looking in %s', 0, 1, @table) WITH NOWAIT;
  SET @sums = N''; SET @map = N''; SET @pairs = 0;

  DECLARE pair_cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT l.id, l.kind, c.name, ty.name
    FROM #mb_labels l
    CROSS JOIN sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.system_type_id
    WHERE c.object_id = @object_id
      AND c.is_computed = 0
      AND (
            (ty.name IN ('char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext'))
         OR (l.kind = 'date' AND ty.name IN ('date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'))
         OR (l.kind = 'number' AND ty.name IN ('tinyint', 'smallint', 'int', 'bigint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'))
      )
    ORDER BY l.id, c.column_id;
  OPEN pair_cur;
  FETCH NEXT FROM pair_cur INTO @id, @kind, @col, @type;
  WHILE 1 = 1
  BEGIN
    IF @@FETCH_STATUS = 0
    BEGIN
      SET @cond = CASE
        WHEN @type IN ('text', 'ntext') THEN N'LTRIM(RTRIM(CAST(' + QUOTENAME(@col) + N' AS nvarchar(max)))) = @v' + CAST(@id AS nvarchar(10))
        WHEN @type IN ('char', 'varchar', 'nchar', 'nvarchar') THEN N'LTRIM(RTRIM(' + QUOTENAME(@col) + N')) = @v' + CAST(@id AS nvarchar(10))
        WHEN @kind = 'date' THEN N'CAST(' + QUOTENAME(@col) + N' AS date) = @d' + CAST(@id AS nvarchar(10))
        ELSE QUOTENAME(@col) + N' = @n' + CAST(@id AS nvarchar(10))
      END;
      SET @pairs = @pairs + 1;
      SET @sums = @sums + CASE WHEN @pairs > 1 THEN N',' ELSE N'' END
        + N'SUM(CASE WHEN ' + @cond + N' THEN 1 ELSE 0 END) AS c' + CAST(@pairs AS nvarchar(10));
      SET @map = @map + CASE WHEN @pairs > 1 THEN N',' ELSE N'' END
        + N'(' + CAST(@id AS nvarchar(10)) + N',N''' + REPLACE(@col, N'''', N'''''') + N''',s.c' + CAST(@pairs AS nvarchar(10)) + N')';
      FETCH NEXT FROM pair_cur INTO @id, @kind, @col, @type;
    END;
    -- Run what has been built when the table is done, or every 500 pairs
    -- (SQL Server allows at most 4,096 columns in one query).
    IF @pairs > 0 AND (@@FETCH_STATUS <> 0 OR @pairs >= 500)
    BEGIN
      SET @sql = @decl
        + N'SELECT x.id, N''' + REPLACE(@table, N'''', N'''''') + N''', x.col, x.n FROM (SELECT ' + @sums
        + N' FROM ' + @table_q + N') s CROSS APPLY (VALUES ' + @map + N') x(id, col, n) WHERE x.n > 0;';
      BEGIN TRY
        INSERT INTO #mb_found (id, table_name, column_name, matching_rows) EXEC sp_executesql @sql;
      END TRY
      BEGIN CATCH
        DECLARE @err nvarchar(2048) = ERROR_MESSAGE();
        RAISERROR(N'Skipped part of %s: %s', 0, 1, @table, @err) WITH NOWAIT;
      END CATCH;
      SET @sums = N''; SET @map = N''; SET @pairs = 0;
    END;
    IF @@FETCH_STATUS <> 0 BREAK;
  END;
  CLOSE pair_cur; DEALLOCATE pair_cur;

  FETCH NEXT FROM table_cur INTO @object_id, @table, @table_q;
END;
CLOSE table_cur; DEALLOCATE table_cur;

-- The result: where each value was found. A label with no rows found is
-- still listed, with empty table and column, so MapBridge knows it was looked for.
SELECT l.screen, l.label, ISNULL(f.table_name, N'') AS table_name, ISNULL(f.column_name, N'') AS column_name, ISNULL(f.matching_rows, 0) AS matching_rows
FROM #mb_labels l
LEFT JOIN #mb_found f ON f.id = l.id
ORDER BY l.id, f.matching_rows, f.table_name, f.column_name;

DROP TABLE #mb_found;
DROP TABLE #mb_labels;
`;
}

/**
 * Read a results file saved from the script. SQL Server Management Studio
 * leaves out the heading row by default, so both forms are accepted.
 * @param {string[][]} rows
 * @returns {{screen:string,label:string,table:string,column:string,rows:number}[]}
 */
export function parseTraceResults(rows) {
  const clean = (rows || []).map(r => r.map(c => String(c ?? '').replace(/^﻿/, '').trim())).filter(r => r.some(Boolean));
  if (!clean.length) throw new Error('The results file is empty.');
  let body = clean;
  if (/^screen$/i.test(clean[0][0]) && /^label$/i.test(clean[0][1])) body = clean.slice(1);
  const out = [];
  for (const r of body) {
    if (r.length < 5) throw new Error('This does not look like a MapBridge results file. It needs five values on each line: screen, label, table, field and a count of rows.');
    const n = Number(String(r[4]).replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new Error(`This does not look like a MapBridge results file. "${r[4]}" is not a count of rows.`);
    const table = r[2] === 'NULL' ? '' : r[2];
    const column = r[3] === 'NULL' ? '' : r[3];
    out.push({ screen: r[0], label: r[1], table, column, rows: table && column ? n : 0 });
  }
  return out;
}

const placeKey = (t, c) => `${t}.${c}`;

/**
 * Combine the results of one or more records. A place stays a candidate
 * only if it matched in every run where that label was looked for.
 * @param {{rows:object[]}[]} runs
 * @returns {Map<string, {screen, label, runs:number, status:string, candidates:{table,column,rows,sameTable?:boolean}[]}>}
 */
export function combineRuns(runs) {
  const byLabel = new Map();
  for (const run of runs) {
    const seen = new Map();
    for (const r of run.rows) {
      const key = `${r.screen}␟${r.label}`;
      if (!seen.has(key)) seen.set(key, { screen: r.screen, label: r.label, places: new Map() });
      if (r.table && r.column && r.rows > 0) seen.get(key).places.set(placeKey(r.table, r.column), { table: r.table, column: r.column, rows: r.rows });
    }
    for (const [key, s] of seen) {
      if (!byLabel.has(key)) byLabel.set(key, { screen: s.screen, label: s.label, runs: 0, hitAny: false, places: null });
      const e = byLabel.get(key);
      e.runs++;
      if (s.places.size) e.hitAny = true;
      if (e.places === null) e.places = new Map(s.places);
      else {
        for (const k of [...e.places.keys()]) {
          if (!s.places.has(k)) e.places.delete(k);
          else e.places.get(k).rows = Math.max(e.places.get(k).rows, s.places.get(k).rows);
        }
      }
    }
  }

  // Tables where other names on the same screen were found in only one place.
  const anchors = new Map();
  for (const e of byLabel.values()) {
    if (e.places?.size === 1) {
      const t = [...e.places.values()][0].table;
      const m = anchors.get(e.screen) || new Map();
      m.set(t, (m.get(t) || 0) + 1);
      anchors.set(e.screen, m);
    }
  }

  const out = new Map();
  for (const [key, e] of byLabel) {
    const candidates = [...(e.places?.values() || [])].sort((a, b) => a.rows - b.rows || a.table.localeCompare(b.table) || a.column.localeCompare(b.column));
    let status;
    if (candidates.length === 1) status = 'one';
    else if (candidates.length > 1) {
      const screenAnchors = anchors.get(e.screen) || new Map();
      candidates.forEach(c => { c.sameTable = screenAnchors.has(c.table); });
      status = candidates.filter(c => c.sameTable).length === 1 ? 'likely' : 'several';
      if (status === 'likely') candidates.sort((a, b) => Number(b.sameTable) - Number(a.sameTable));
    } else status = e.hitAny ? 'conflict' : 'none';
    out.set(key, { screen: e.screen, label: e.label, runs: e.runs, status, candidates });
  }
  return out;
}

/** Rows for the review table: one per screen name that has a result. */
export function traceReviewRows(sourceSchema, combined) {
  const rows = [];
  for (const t of screenTables(sourceSchema)) {
    const screen = screenLabel(t.name);
    for (const c of t.columns || []) {
      const r = combined.get(`${screen}␟${c.name}`);
      const searchable = SEARCHABLE.has(c.type || 'text');
      rows.push({
        id: `${t.name}␟${c.name}`, screenTable: t.name, screen, label: c.name, kind: c.type || 'text',
        linked: c.link || null,
        status: r ? r.status : 'skipped',
        why: r ? '' : searchable ? 'Not in any results file yet.' : 'Yes/no values are in too many rows to trace.',
        runs: r?.runs || 0,
        candidates: r?.candidates || [],
        choice: r && ['one', 'likely'].includes(r.status) ? 0 : (r?.candidates?.length ? 0 : -1),
        ticked: false,
      });
    }
  }
  return rows;
}

/**
 * Record the confirmed links. The screen name keeps a note of where it lives;
 * the real column gets a note of how it was shown on screen. Nothing is
 * overwritten: an existing description on a real column is kept.
 * @returns {{schema:object, linked:number, addedColumns:number}}
 */
export function applyLinks(sourceSchema, rows, { by = '', at = new Date().toISOString() } = {}) {
  const schema = { ...(sourceSchema || { tables: [] }), tables: (sourceSchema?.tables || []).map(t => ({ ...t, columns: (t.columns || []).map(c => ({ ...c })) })) };
  let linked = 0;
  let addedColumns = 0;
  const findTable = name => schema.tables.find(t => t.name === name)
    || schema.tables.find(t => t.name.toLowerCase() === name.toLowerCase())
    || schema.tables.find(t => t.name.replace(/^[^.]+\./, '').toLowerCase() === name.replace(/^[^.]+\./, '').toLowerCase());

  for (const r of rows) {
    if (!r.ticked || r.linked) continue;
    const place = r.candidates[r.choice];
    if (!place) continue;
    const screenTable = schema.tables.find(t => t.name === r.screenTable);
    const label = screenTable?.columns.find(c => c.name === r.label);
    if (!label) continue;
    label.link = { table: place.table, column: place.column, records: r.runs, by, at };

    let real = findTable(place.table);
    if (!real) { real = { name: place.table, origin: 'traced', columns: [] }; schema.tables.push(real); }
    let col = real.columns.find(c => c.name.toLowerCase() === place.column.toLowerCase());
    if (!col) {
      col = { name: place.column, type: '', required: false, description: '', values: '', origin: 'traced' };
      real.columns.push(col);
      addedColumns++;
    }
    const shown = { screen: r.screen, label: r.label };
    col.screenLabels = [...(col.screenLabels || []).filter(s => !(s.screen === shown.screen && s.label === shown.label)), shown];
    if (!col.description) col.description = `Shown as "${r.label}" on the ${r.screen} screen.`;
    linked++;
  }
  return { schema, linked, addedColumns };
}

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** What one round of linking did, in plain words. */
export function traceSummary(c) {
  const detail = [`${num(c.files)} results ${plural(c.files, 'file')} so far, covering ${num(c.records)} ${plural(c.records, 'record')}.`];
  if (c.waiting) detail.push(`${num(c.waiting)} ${plural(c.waiting, 'name was', 'names were')} found but not ticked, so ${plural(c.waiting, 'it is', 'they are')} not linked yet.`);
  if (c.several) detail.push(`${num(c.several)} ${plural(c.several, 'name was', 'names were')} found in more than one place. Another record will narrow ${plural(c.several, 'it', 'them')} down.`);
  if (c.none) detail.push(`${num(c.none)} ${plural(c.none, 'name was', 'names were')} not found. ${plural(c.none, 'It', 'They')} may be worked out from other fields, or written another way.`);
  return {
    title: c.linked ? `Linked ${num(c.linked)} ${plural(c.linked, 'name')} to a real field.` : 'Nothing was linked.',
    detail,
    next: TRACE_TEXT.nextStep,
  };
}
