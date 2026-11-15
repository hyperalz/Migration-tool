# MapBridge

**AI-accelerated column mapping for mission-critical data migrations**

MapBridge is a browser-based tool for agreeing, documenting, and tracking column mappings and sign-off in public-sector data migrations — e.g. transitioning a council from Synergy to Impulse school systems. Built for the real pattern: a local authority, a system supplier, and a delivery consultant all need the same mapping truth, without another spreadsheet.

## Current Version: Browser-Only Prototype

**Important:** This version stores all data in your browser's `localStorage` only. There is no server, no backend, no database. Clear your browser data = your projects are gone. Export your work regularly.

A production version with secure backend, real authentication, invite-based access, and project lifecycle management is on the roadmap.

## What It Does

- **Schema upload & comparison**: Import source and target schemas via JSON or CSV. Each column can include plain-English definitions and value formats (e.g. "1 = eligible, 0 = not eligible").
- **Visual mapping workspace**: Drag from source ● to target ● to create mappings. Definitions and value formats are shown side-by-side; mismatches like `1/0` vs `Y/N` are flagged.
- **AI-assisted suggestions** (new): Two modes:
  - **Heuristic matcher** (offline, no API key): Matches columns by name similarity, type compatibility, definition keywords, and value format alignment. Works entirely in the browser.
  - **LLM mode** (optional): Paste your own OpenAI-compatible API key (stored in browser only) to get smarter suggestions. Only schema metadata is sent—never row data.
- **Transform & lookup rules**: Capture value translations, defaults, and join conditions on each mapping line.
- **Test & live traceability**: Record who sent SQL, who checked test data, who pushed to live, and who signed off—per column, with full audit history.
- **Trial load reconciliation** (new): Compare an extract from the old system with one from the new system. Counts, control totals and every mapped field are checked against the agreed mappings, and the result is a printable report with exceptions grouped by cause.
- **Export**: Download mappings + traceability log as JSON, CSV, or Excel. Export starter SQL stubs with CASE expressions for value translations and COALESCE for defaults.
- **Browser-only storage**: Everything lives in `localStorage`. No credentials, no DPA concerns in this version—because there's no server to worry about.

## Workflow

1. **Create a project**: Name it (e.g. "Birmingham LA — Synergy to Impulse"), pick source and target systems.
2. **Upload schemas**: JSON or CSV. Row 1 = column names, row 2 = types, row 3 = definitions, row 4 = value formats. Sample files are included in `samples/`.
3. **AI-suggest mappings**: Click "AI-suggest mappings" → choose heuristic or LLM → review suggestions → accept/reject individually or in bulk. Each accepted mapping is recorded in the audit trail.
4. **Map manually**: Drag source ● → target ●. Add transform notes, lookup rules (e.g. `1 -> Y, 0 -> N`), and defaults. Flag value mismatches.
5. **Test & live**: Record delivery and checks per column. Click **+** to advance; click a completed tick to revert and re-do. Every step logs who and when.
6. **Reconcile**: After each trial load, compare old and new extracts and produce the reconciliation report.
7. **Export & close**: Download mapping spec + traceability log, then delete the project (or just clear browser data).

## Running Locally

No build step. Just open `index.html` in a browser, or:

```bash
# Serve with Python
python3 -m http.server 8000

# Or Node.js
npx http-server -p 8000
```

Then open `http://localhost:8000`.

## GitHub Pages Deployment

Push to `main`, enable GitHub Pages in repo settings → Pages → Source: Deploy from branch `main` → folder: `/ (root)`.

Your site will be live at `https://<username>.github.io/<repo-name>/`.

## AI Mapping Suggestions

MapBridge offers two suggestion modes:

### Heuristic Mode (Offline, No API Key)

Works entirely in the browser. Scores potential mappings based on:
- **Name similarity**: Levenshtein distance, substring matching
- **Type compatibility**: Numeric ↔ numeric, string ↔ string, date ↔ date
- **Definition overlap**: Shared keywords between column descriptions
- **Value format alignment**: Detects when source sends `1/0` and target expects `Y/N`

When value formats differ, the heuristic matcher suggests translations (e.g. `1 -> Y, 0 -> N`) that you can accept into the lookup rule field.

### LLM Mode (Optional, User-Provided API Key)

1. Click **Settings** → Choose **LLM mode**
2. Configure:
   - **API Base URL**: Default is OpenAI (`https://api.openai.com/v1`), but any OpenAI-compatible endpoint works (e.g. Azure OpenAI, local llama.cpp server, etc.)
   - **Model**: e.g. `gpt-4o-mini`, `gpt-4`, or your custom model name
   - **API Key**: Stored in browser `localStorage` only. Never sent anywhere except the endpoint you configure.
3. Click **AI-suggest mappings** → **Generate suggestions** → review and accept/reject

**Privacy**: Only schema metadata is sent (column names, types, definitions, allowed values). No row data. Your API key stays in the browser and is only used for the chat completions endpoint you specify.

### Suggestion Review UI

Both modes show a list of suggestions with:
- Confidence score (0–100%)
- Plain-English reason
- Suggested value translations (when formats differ)

You can:
- Accept individually or in bulk
- Reject individually or in bulk

Every accepted mapping is recorded in the audit trail with "AI-suggested (heuristic/llm, X% confidence)" noted.

## Schema Connector (Run-Once Tool)

For councils that don't want to manually copy/paste table definitions, MapBridge includes a **run-once, read-only connector** that extracts schema metadata from SQL Server or Oracle.

### What It Does

- ✅ Reads **metadata only**: table names, column names, data types, nullability, primary/foreign keys, check constraints, column descriptions
- ✅ **Never reads row data**: Queries `information_schema` / system catalogs only
- ❌ **No background service**: Runs once and exits
- ❌ **No listening ports**: Writes a single JSON file

### Quick Start

```bash
# SQL Server
cd connector
python mapbridge_connector.py --db-type sqlserver --host db-server \
    --database Synergy_Production --username readonly_user --output synergy-schema.json

# Oracle
python mapbridge_connector.py --db-type oracle --host db-server \
    --service ORCLPROD --username readonly_user --output oracle-schema.json
```

The output is a MapBridge-compatible JSON file that you import via **"Import from connector file"** on the setup page.

### Council IT Workflow

1. Council IT creates a read-only database user with metadata-only permissions (see `connector/README.md` for GRANT statements)
2. Run the connector inside their network once
3. Share the JSON file with the consultant
4. After migration, delete the file and drop the database user

**No row data is ever accessed.** See `connector/SECURITY.md` for a plain-English doc you can share with IT and Data Protection Officers.

For full documentation, see [`connector/README.md`](connector/README.md).

## Trial Load Reconciliation

After each trial load, the **Reconcile** step checks that what landed in the new system matches the old system, using the agreed mappings as the rule book.

### What it checks

- **Records**: counts on each side, records missing from the new system, records only in the new system, duplicates.
- **Fields**: every mapped field on every paired record. Translation rules (`1 -> Y, 0 -> N`) and default values are applied first, then the result is compared with the new system.
- **Control totals**: amount fields added up on each side, to the penny.
- **Format-only differences** count as matched: spacing, `100` vs `100.00`, date layout (`2026-04-03` vs `03/04/2026`, day first), blank vs `NULL`.

Differences are grouped by cause in plain English, for example *Old value "H" should become "On hold" but the new system holds "Inactive" (3 records)*, with a severity and up to five example records.

### How to use it

1. Open a project and choose **Reconcile**.
2. For each table, upload a CSV extract from the old system and one from the new system. Row 1 must be the column names, matching the names used in the mappings.
3. Under **Fields and settings**, confirm which fields identify a record (tick several for a combined key), which to add up as totals, and which to mask in the report.
4. **Run checks**, then open the report. **Print or save as PDF** gives a clean copy.

To try it without your own data, choose **Try the finance demo** on the projects page and run demo trial loads 1 and 2. The same extracts are in `samples/finance-demo/` if you want to try uploading. All of it is invented.

### The report

Summary, exceptions (worst first), change since the previous load (fixed, still open, new), results by table, scope and method (including what was **not** covered), and a review and acceptance record.

Each run carries a SHA-256 fingerprint of its results. The report recalculates it on opening and says whether the results are unchanged since the run.

### Privacy

- Extract files are read in the browser. Rows are never written to `localStorage` or sent anywhere.
- Only counts, totals, record keys and a few example values per exception are kept.
- Fields marked **Mask values in report** show dots and a length, never the value. Fields that look personal are pre-ticked; check the ticks before running.
- Record keys are shown so exceptions can be traced. A key such as a payroll number still identifies a person, so treat the report as personal data.

### Limits

- It compares two extract files. It does not look at screens, reports, calculated fields or interfaces in the new system.
- Match and mismatch are decided by fixed rules. No AI is used in the checks or the report.
- Large extracts are held in browser memory while the check runs.

### Tests

```bash
node --test tests/reconcile.test.mjs
```

## CSV Parsing

MapBridge now uses **Papa Parse** for robust CSV parsing. Quoted fields like `"Y = eligible, N = not eligible"` are handled correctly. If rows have mismatched column counts, they are skipped and a warning is shown.

## SQL Export

The "Download SQL stubs" export now reflects transforms, lookup rules, and defaults:

- **Lookup rules**: Parsed into `CASE` expressions (e.g. `WHEN fsm_flag = '1' THEN 'Y'`)
- **Defaults**: Wrapped in `COALESCE(column, 'default_value')`
- **Transform notes**: Marked as `-- TODO: Implement transformation logic for: ...`

This gives you a head start on writing the actual migration SQL.

## Data Storage & Privacy

- **Current version**: All data is in your browser's `localStorage`. No server, no backend.
- **No credentials**: You upload JSON/CSV schemas; MapBridge doesn't connect to live databases (yet).
- **No DPA concerns**: Because there's no server and no row data is stored.
- **AI mode**: Your API key is stored in `localStorage` and only sent to the endpoint you configure. Schema metadata (not row data) is sent to the LLM.

## Roadmap

- [x] **Schema connector** (completed in PR #2): Run-once, read-only tool for SQL Server/Oracle that extracts metadata (no row data) and outputs MapBridge JSON. Council IT runs it inside their network, shares the file, then deletes it. See `connector/README.md`.
- [ ] **Shared backend with auth**: Secure project workspaces, invite-based access, role-based permissions.
- [ ] **Automatic connector upload**: Connector posts directly to MapBridge backend (requires auth + project token).
- [ ] **Live connectors** (browser-based): Read-only metadata extraction from Synergy, SIMS, Capita One, Impulse, iTrent, Cority via browser extension or Electron app.
- [ ] **Data profiling**: Column value distributions, null rates, data quality checks—all run inside the client environment, not on a server.
- [x] **Trial load reconciliation**: Record counts, missing and duplicated records, control totals, field-by-field comparison using the agreed mappings, and a printable report. See "Trial Load Reconciliation" above.
- [ ] **Value distribution checks**: Compare how often each value appears before and after.
- [ ] **Schema packs**: Pre-loaded definitions for common MIS platforms (SIMS pupil, Synergy attendance, iTrent payroll).
- [ ] **Cutover runbook generation**: Export a step-by-step guide for the final go-live.
- [ ] **Delete-on-completion lifecycle**: Export mapping package → trigger permanent deletion of all project data.

## Sample Data

Sample schemas are included in `samples/`:

- `synergy-schema.json` / `synergy-pupil-extract.csv`: Source system example (4 tables, column definitions + value formats)
- `impulse-schema.json` / `impulse-pupil-template.csv`: Target system example (4 tables, vendor value formats documented)

Load these via the "Load sample" buttons in the app to try the workflow.

## Technology Stack

- **Static HTML/CSS/JS**: No build step, no framework bloat
- **Libraries**:
  - [Papa Parse](https://www.papaparse.com/): CSV parsing with proper quoted field support
  - [SheetJS (xlsx)](https://sheetjs.com/): Excel export
  - [Chart.js](https://www.chartjs.org/): Dashboard charts
- **Storage**: Browser `localStorage`
- **Hosting**: GitHub Pages or any static host

## Contributing

Contributions welcome! This is an open prototype for a commercial service (Foam Works Digital's AI-accelerated migration offer). If you're building or have built something similar for education or public-sector migrations, open an issue or PR.

## License

MIT License. See `LICENSE` file.

## Author

Built by [Alex Osborne / Foam Works Digital](https://foamworks.digital) for public-sector migration consultants.

---

**Browser-only version. Export your work regularly. Production backend coming soon.**
