# MapBridge Schema Connector

A **run-once, read-only** tool that extracts schema metadata from SQL Server or Oracle databases and outputs a MapBridge-compatible JSON file.

## What It Does

- ✅ Reads **metadata only**: table names, column names, data types, nullability, lengths, primary/foreign keys, check constraints, column descriptions
- ✅ **Never reads row data**: Queries `information_schema` and system catalogs only
- ❌ **No background service**: Runs once and exits
- ❌ **No listening ports**: Does not open any network ports
- ❌ **No outbound calls**: Writes a single JSON file and nothing else

## Use Case

During a migration (e.g. Synergy → Impulse), a council's IT team installs this connector inside their network, runs it once to extract schema metadata, gives the JSON file to the consultant, then deletes the connector. No manual copy/paste of table definitions.

---

## Installation

### Requirements

- Python 3.7 or later
- Database driver (installed automatically):
  - **SQL Server**: `pyodbc` (requires ODBC Driver 17) or `pymssql`
  - **Oracle**: `oracledb` (pure Python) or `cx_Oracle` (requires Oracle Client)

### Install from source

```bash
# Clone or download the connector folder
cd connector

# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Single-file executable (optional)

For councils that can't install Python dependencies, build a standalone executable:

```bash
# Install PyInstaller
pip install pyinstaller

# Build single-file executable
pyinstaller --onefile mapbridge_connector.py

# Result: dist/mapbridge_connector or dist/mapbridge_connector.exe
# This file can be copied to any machine and run without Python installed
```

---

## Usage

### SQL Server with SQL Authentication

```bash
python mapbridge_connector.py \
    --db-type sqlserver \
    --host sql-server.internal \
    --database Synergy_Production \
    --username mapbridge_readonly \
    --output synergy-schema.json
```

You'll be prompted for the password (safer than passing it on the command line).

### SQL Server with Windows Authentication

```bash
python mapbridge_connector.py \
    --db-type sqlserver \
    --host sql-server.internal \
    --database Synergy_Production \
    --windows-auth \
    --output synergy-schema.json
```

No username/password needed—uses your current Windows credentials.

### Oracle

```bash
python mapbridge_connector.py \
    --db-type oracle \
    --host oracle-db.internal \
    --service ORCLPROD \
    --username mapbridge_readonly \
    --output oracle-schema.json
```

### Filter Specific Schemas or Tables

```bash
# Only extract specific schemas
python mapbridge_connector.py \
    --db-type sqlserver \
    --host localhost \
    --database MyDB \
    --schemas dbo,stage \
    --username readonly_user \
    --output schema.json

# Only extract specific tables
python mapbridge_connector.py \
    --db-type sqlserver \
    --host localhost \
    --database MyDB \
    --tables pupils,staff,attendance \
    --username readonly_user \
    --output schema.json
```

---

## Output

The connector writes a single JSON file in MapBridge format:

```json
{
  "system": "Synergy_Production",
  "tables": [
    {
      "name": "dbo.pupils",
      "columns": [
        {
          "name": "pupil_id",
          "type": "int",
          "required": true,
          "description": "Internal Synergy pupil identifier",
          "values": ""
        },
        {
          "name": "fsm_flag",
          "type": "char(1)",
          "required": false,
          "description": "Free school meals eligibility",
          "values": "([fsm_flag]='Y' OR [fsm_flag]='N')"
        }
      ]
    }
  ],
  "importedAt": "2026-10-10T14:30:00Z"
}
```

A human-readable summary is printed to the console:

```
============================================================
SCHEMA EXTRACTION SUMMARY
============================================================
System: Synergy_Production
Extracted at: 2026-10-10T14:30:00Z
Total tables: 8
Total columns: 127

Tables:
  - dbo.pupils (23 columns)
  - dbo.staff (18 columns)
  - dbo.attendance (12 columns)
  ...

============================================================
✓ Schema metadata extracted successfully
✓ NO ROW DATA was read or accessed
✓ This file contains only table and column definitions
============================================================
```

---

## Required Database Permissions

The connector needs **read-only access to system catalog views**. No access to user data is required.

### SQL Server

Create a login and grant the minimum required permissions:

```sql
-- Create login
CREATE LOGIN mapbridge_readonly WITH PASSWORD = 'SecurePassword123!';

-- Create user in the target database
USE Synergy_Production;
CREATE USER mapbridge_readonly FOR LOGIN mapbridge_readonly;

-- Grant read access to system catalogs only (no user data)
GRANT VIEW DEFINITION TO mapbridge_readonly;
GRANT SELECT ON sys.tables TO mapbridge_readonly;
GRANT SELECT ON sys.columns TO mapbridge_readonly;
GRANT SELECT ON sys.types TO mapbridge_readonly;
GRANT SELECT ON sys.schemas TO mapbridge_readonly;
GRANT SELECT ON sys.indexes TO mapbridge_readonly;
GRANT SELECT ON sys.index_columns TO mapbridge_readonly;
GRANT SELECT ON sys.foreign_key_columns TO mapbridge_readonly;
GRANT SELECT ON sys.check_constraints TO mapbridge_readonly;
GRANT SELECT ON sys.extended_properties TO mapbridge_readonly;

-- The user now has metadata-only access and cannot read pupil/staff records
```

### Oracle

Create a user and grant catalog access:

```sql
-- Create user
CREATE USER mapbridge_readonly IDENTIFIED BY SecurePassword123;

-- Grant session and basic catalog access
GRANT CREATE SESSION TO mapbridge_readonly;
GRANT SELECT ON ALL_TABLES TO mapbridge_readonly;
GRANT SELECT ON ALL_TAB_COLUMNS TO mapbridge_readonly;
GRANT SELECT ON ALL_COL_COMMENTS TO mapbridge_readonly;
GRANT SELECT ON ALL_CONSTRAINTS TO mapbridge_readonly;
GRANT SELECT ON ALL_CONS_COLUMNS TO mapbridge_readonly;

-- To read from specific schemas (e.g. SYNERGY), grant SELECT_CATALOG_ROLE
GRANT SELECT_CATALOG_ROLE TO mapbridge_readonly;

-- The user now has metadata-only access to the catalogs
```

**Important**: These permissions allow reading *table definitions* but **not** pupil, staff, or attendance *records*. The connector never queries user tables, only `sys.*` (SQL Server) or `ALL_*` (Oracle) views.

---

## What Is Read vs What Is Never Read

| **Metadata (Read)**              | **User Data (Never Read)**           |
|-----------------------------------|---------------------------------------|
| Table names                       | Pupil records                         |
| Column names                      | Staff records                         |
| Data types (int, varchar, etc.)   | Attendance records                    |
| Nullability (required or optional)| Any row data from user tables         |
| Column lengths (e.g. varchar(50)) | Login credentials stored in tables    |
| Primary keys                      | Personal data (names, addresses, etc.)|
| Foreign keys                      | Financial data                        |
| Check constraints (allowed values)| Any sensitive information             |
| Column descriptions/comments      |                                       |

The connector **only queries system catalog views** (`sys.*` on SQL Server, `ALL_*` on Oracle). It never runs `SELECT * FROM pupils` or any query against user tables.

---

## Importing into MapBridge

1. Run the connector and get your `schema.json` file
2. Open MapBridge: `http://localhost:8080/app.html` (or your hosted URL)
3. Create a project
4. On the **Connect schemas** step, click **"Import from connector file"**
5. Choose `schema.json`
6. Review the preview (table/column counts)
7. Click **"Apply"** to load the schema

Now you can map columns without manually copying table definitions.

---

## Removal After Migration

Once the migration is complete and you no longer need the schema file:

1. **Delete the JSON file**: `rm synergy-schema.json`
2. **Delete the connector folder**: `rm -rf connector/`
3. **Revoke the database user** (SQL Server):
   ```sql
   USE Synergy_Production;
   DROP USER mapbridge_readonly;
   DROP LOGIN mapbridge_readonly;
   ```
4. **Revoke the database user** (Oracle):
   ```sql
   DROP USER mapbridge_readonly CASCADE;
   ```

That's it. No background services to stop, no config files to hunt down—the connector is completely gone.

---

## Troubleshooting

### SQL Server: "pyodbc.Error: Data source name not found"

Install the ODBC Driver 17 for SQL Server:
- **Linux**: `apt install unixodbc unixodbc-dev` + [Microsoft ODBC Driver](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server)
- **Windows**: [Download from Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
- **macOS**: `brew install unixodbc` + [Microsoft ODBC Driver](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/install-microsoft-odbc-driver-sql-server-macos)

Or use `pymssql` instead (no ODBC required):

```bash
pip uninstall pyodbc
pip install pymssql
```

### Oracle: "DPI-1047: Cannot locate a 64-bit Oracle Client library"

Install Oracle Instant Client or use the pure-Python `oracledb` driver:

```bash
pip install oracledb
```

No Oracle Client needed with `oracledb` >= 2.0.

### "No tables found matching the filters"

- Check your `--schemas` and `--tables` filters
- Ensure the user has `SELECT` permission on the system catalogs
- For Oracle, make sure you're using the correct schema name (usually uppercase)

---

## Development

### Run tests

```bash
# Unit tests (no live database needed)
pytest tests/

# With coverage
pytest --cov=mapbridge_connector tests/
```

### Integration tests (optional)

To test against a real database, use Docker:

```bash
# SQL Server
docker run -e 'ACCEPT_EULA=Y' -e 'SA_PASSWORD=YourStrong!Passw0rd' \
    -p 1433:1433 -d mcr.microsoft.com/mssql/server:2022-latest

# Run connector against it
python mapbridge_connector.py --db-type sqlserver --host localhost \
    --database master --username sa --password 'YourStrong!Passw0rd' \
    --output test-schema.json
```

---

## Why Python?

**Easy for council IT to verify**: Python is human-readable, and IT can inspect exactly what the script does before running it.

**Minimal dependencies**: Just the DB driver. No web frameworks, no network libraries.

**Single-file option**: PyInstaller can bundle everything into one `.exe` or binary that runs without Python installed.

**Cross-platform**: Works on Windows (council networks), Linux, and macOS.

---

## Security & Privacy

See [SECURITY.md](SECURITY.md) for a plain-English document you can share with IT and Data Protection Officers.

---

## Support

For issues or questions:
1. Check the [troubleshooting section](#troubleshooting)
2. Review [SECURITY.md](SECURITY.md) for IT/DPO concerns
3. Open an issue on the MapBridge repository

---

## License

MIT License. See `../LICENSE` file.
