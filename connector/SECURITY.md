# MapBridge Schema Connector — For IT and Data Protection Officers

**One-page plain-English overview**

---

## What This Tool Does

The MapBridge Schema Connector is a **read-only, run-once script** that extracts **table and column definitions** from your SQL Server or Oracle database. It's used during data migrations (e.g. moving from Synergy to Impulse) so consultants know what fields exist in your system—without manually typing or copying table structures.

**It reads metadata only. It never reads pupil, staff, or attendance records.**

---

## What It Reads

| ✅ What is read (metadata)           | ❌ What is never read (user data)     |
|--------------------------------------|----------------------------------------|
| Table names (e.g. "pupils", "staff") | Pupil names, addresses, or records     |
| Column names (e.g. "pupil_id", "fsm_flag") | Staff names, salaries, or records |
| Data types (e.g. "int", "varchar(50)") | Attendance records                  |
| Whether a field is required or optional | Login credentials                  |
| Primary keys and foreign keys        | Any personal or sensitive data         |
| Check constraints (allowed values)   | Any row data from tables               |
| Column descriptions/comments         |                                        |

**Example**: The tool reads that there's a column called `fsm_flag` of type `char(1)` with allowed values `Y` or `N`. It does **not** read which pupils have `Y` or `N` in that column.

---

## What It Does Not Do

- ❌ Does not read row data (no `SELECT * FROM pupils`)
- ❌ Does not open any network ports (not a service)
- ❌ Does not run in the background (runs once and exits)
- ❌ Does not send data over the internet (writes a local JSON file only)
- ❌ Does not store credentials (username/password are used once and discarded)
- ❌ Does not modify the database (read-only queries only)

---

## How It Works

1. **Council IT creates a read-only database user** with permissions to view system catalogs (table definitions) but **not** user data.
2. **Consultant or IT runs the connector** with that user's credentials: `python mapbridge_connector.py --db-type sqlserver --host db-server --database Synergy --username readonly_user --output schema.json`
3. **Tool queries system catalogs only**:
   - SQL Server: `sys.tables`, `sys.columns`, `sys.types` (not user tables)
   - Oracle: `ALL_TAB_COLUMNS`, `ALL_CONSTRAINTS` (not user data)
4. **Tool writes a JSON file** with table and column definitions, then exits.
5. **Consultant uses the JSON file** in MapBridge to map Synergy fields → Impulse fields.
6. **After the migration, delete the JSON file and the tool.** No traces left.

---

## Database Permissions Required

The tool needs **read access to system catalog views only**—not user tables.

### SQL Server Example

```sql
-- Create a user with metadata-only access
CREATE LOGIN mapbridge_readonly WITH PASSWORD = 'SecurePassword123!';
USE Synergy_Production;
CREATE USER mapbridge_readonly FOR LOGIN mapbridge_readonly;

-- Grant read access to system catalogs (table definitions)
GRANT VIEW DEFINITION TO mapbridge_readonly;
GRANT SELECT ON sys.tables TO mapbridge_readonly;
GRANT SELECT ON sys.columns TO mapbridge_readonly;
GRANT SELECT ON sys.types TO mapbridge_readonly;
-- (etc. — see README.md for full list)
```

**Test it**: Log in as `mapbridge_readonly` and try:
- ✅ `SELECT * FROM sys.tables` → Works (metadata)
- ❌ `SELECT * FROM pupils` → Fails (no access to user data)

### Oracle Example

```sql
-- Create a user with catalog access
CREATE USER mapbridge_readonly IDENTIFIED BY SecurePassword123;
GRANT CREATE SESSION TO mapbridge_readonly;
GRANT SELECT_CATALOG_ROLE TO mapbridge_readonly;
```

Again, this user can read *table structures* but not *pupil records*.

---

## Data Protection Impact

| Question                                  | Answer                                                                 |
|-------------------------------------------|------------------------------------------------------------------------|
| **What personal data is processed?**      | None. Only table/column names and data types are extracted.            |
| **Where is the data stored?**             | In a single JSON file on your network (e.g. `schema.json`).            |
| **Who has access?**                       | The consultant and anyone you share the JSON file with.                |
| **Is it sent over the internet?**         | No. The tool writes a local file and does nothing else.                |
| **How long is it retained?**              | Until you delete it. We recommend deletion after the migration.        |
| **Is it encrypted?**                      | No—it's metadata (table names), not personal data.                     |
| **What if the consultant's laptop is lost?** | The JSON file contains no pupil names, addresses, or sensitive data—only column definitions. Risk is minimal. |
| **GDPR / DPA compliance?**                | Extracting table structures (not personal data) is not a GDPR processing activity. However, handle the file as you would any technical documentation. |

---

## Example Output (What the File Looks Like)

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
          "name": "forename",
          "type": "varchar(50)",
          "required": true,
          "description": "Pupil given name",
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
  ]
}
```

**Notice**: No names (e.g. "John Smith"), no addresses, no UPNs. Just field definitions.

---

## Removal After Migration

Once the migration is complete:

1. **Delete the JSON file**: `rm schema.json`
2. **Delete the connector folder**: `rm -rf connector/`
3. **Revoke the database user**:
   ```sql
   -- SQL Server
   USE Synergy_Production;
   DROP USER mapbridge_readonly;
   DROP LOGIN mapbridge_readonly;
   
   -- Oracle
   DROP USER mapbridge_readonly CASCADE;
   ```

No background services to stop, no config files to hunt down. The tool is completely gone.

---

## Risk Assessment

| Risk                                      | Likelihood | Impact | Mitigation                                                                 |
|-------------------------------------------|------------|--------|---------------------------------------------------------------------------|
| **Consultant accesses pupil data**        | Low        | High   | User has no `SELECT` permission on user tables—only system catalogs.      |
| **JSON file leaks table names**           | Low        | Low    | Table names are not personal data. File should be deleted after migration.|
| **Tool installs malware**                 | Very Low   | High   | Python source code is human-readable. IT can inspect before running.      |
| **Tool opens backdoor / network port**    | Very Low   | High   | No network code. Writes one file and exits. IT can verify with code review.|
| **Credentials stored in plaintext**       | None       | N/A    | Credentials are used once and discarded (not written to disk).            |

---

## Questions for Your DPO

1. **Do we need a DPIA?**  
   Probably not—the tool reads table structures (not personal data). However, your DPO may want to document this as part of the migration project.

2. **Can we share the JSON file with the consultant?**  
   Yes. It's technical metadata (like a data dictionary), not personal data.

3. **Do we need a data processing agreement?**  
   That depends on your migration contract. The JSON file itself doesn't trigger GDPR obligations, but your migration project might.

4. **What if we're audited?**  
   Keep a copy of the JSON file and this document. You can demonstrate that no pupil data was extracted.

---

## Verification Checklist for IT

Before running the connector in production:

- [ ] Inspect the Python source code (`mapbridge_connector.py`)—it's ~800 lines, human-readable
- [ ] Confirm no `SELECT` queries against user tables (search for `FROM pupils`, `FROM staff`, etc.)—you won't find any
- [ ] Test with a non-production database first
- [ ] Create a read-only user with metadata-only permissions
- [ ] Run the tool and inspect the JSON output—does it contain only table/column names?
- [ ] Try to `SELECT * FROM pupils` with the read-only user—it should fail
- [ ] After the migration, revoke the user and delete the JSON file

---

## Contact

For questions about this tool:
- **Technical**: See `README.md` in the connector folder
- **Security**: Review this document and the source code
- **MapBridge**: Contact your migration consultant or open an issue on the MapBridge repository

---

**Summary for DPOs**: This tool reads table structures (not pupil data), writes one JSON file (no network activity), and is deleted after the migration. No personal data processing. Low risk. Document as part of the migration project.
