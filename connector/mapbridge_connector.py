#!/usr/bin/env python3
"""
MapBridge Schema Connector

A run-once, read-only tool that extracts schema metadata from SQL Server or Oracle
and outputs a MapBridge-compatible JSON file. Never reads row data.

Usage:
    python mapbridge_connector.py --db-type sqlserver --host localhost --database mydb \\
        --output schema.json [--username user] [--password pass]
    
    python mapbridge_connector.py --db-type oracle --host localhost --service mydb \\
        --output schema.json [--username user] [--password pass]

For detailed instructions, see README.md
"""

import argparse
import getpass
import json
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional

__version__ = "1.0.0"


class SchemaColumn:
    """Represents a database column with MapBridge-compatible metadata."""
    
    def __init__(
        self,
        name: str,
        data_type: str,
        required: bool = False,
        description: str = "",
        values: str = "",
        max_length: Optional[int] = None,
        is_primary_key: bool = False,
        is_foreign_key: bool = False,
    ):
        self.name = name
        self.data_type = data_type
        self.required = required
        self.description = description
        self.values = values
        self.max_length = max_length
        self.is_primary_key = is_primary_key
        self.is_foreign_key = is_foreign_key
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to MapBridge JSON format."""
        type_str = self.data_type
        if self.max_length:
            type_str = f"{self.data_type}({self.max_length})"
        
        return {
            "name": self.name,
            "type": type_str,
            "required": self.required,
            "description": self.description,
            "values": self.values,
        }


class SchemaTable:
    """Represents a database table with its columns."""
    
    def __init__(self, name: str, schema: str = ""):
        self.name = name
        self.schema = schema
        self.columns: List[SchemaColumn] = []
    
    def add_column(self, column: SchemaColumn):
        self.columns.append(column)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to MapBridge JSON format."""
        return {
            "name": f"{self.schema}.{self.name}" if self.schema else self.name,
            "columns": [col.to_dict() for col in self.columns],
        }


class SchemaConnector:
    """Base class for database schema connectors."""
    
    def __init__(self, host: str, database: str, username: str, password: str, port: Optional[int] = None):
        self.host = host
        self.database = database
        self.username = username
        self.password = password
        self.port = port
        self.connection = None
    
    def connect(self):
        """Connect to the database. Implemented by subclasses."""
        raise NotImplementedError
    
    def disconnect(self):
        """Close the database connection."""
        if self.connection:
            self.connection.close()
            self.connection = None
    
    def extract_schema(self, schemas: Optional[List[str]] = None, tables: Optional[List[str]] = None) -> List[SchemaTable]:
        """Extract schema metadata. Implemented by subclasses."""
        raise NotImplementedError
    
    def __enter__(self):
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()


class SQLServerConnector(SchemaConnector):
    """SQL Server schema connector using pyodbc or pymssql."""
    
    def __init__(self, *args, use_windows_auth: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self.use_windows_auth = use_windows_auth
        if not self.port:
            self.port = 1433
    
    def connect(self):
        """Connect to SQL Server."""
        try:
            import pyodbc
            self._driver = 'pyodbc'
        except ImportError:
            try:
                import pymssql
                self._driver = 'pymssql'
            except ImportError:
                raise ImportError(
                    "Neither pyodbc nor pymssql is installed. "
                    "Install one with: pip install pyodbc (or pymssql)"
                )
        
        if self._driver == 'pyodbc':
            if self.use_windows_auth:
                conn_str = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={self.host},{self.port};"
                    f"DATABASE={self.database};"
                    f"Trusted_Connection=yes;"
                )
            else:
                conn_str = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={self.host},{self.port};"
                    f"DATABASE={self.database};"
                    f"UID={self.username};"
                    f"PWD={self.password};"
                )
            import pyodbc
            self.connection = pyodbc.connect(conn_str, readonly=True)
        else:
            import pymssql
            self.connection = pymssql.connect(
                server=self.host,
                port=self.port,
                database=self.database,
                user=self.username,
                password=self.password,
                as_dict=False,
            )
    
    def extract_schema(self, schemas: Optional[List[str]] = None, tables: Optional[List[str]] = None) -> List[SchemaTable]:
        """Extract schema metadata from SQL Server."""
        cursor = self.connection.cursor()
        
        # Query for tables, columns, types, nullability
        query = """
        SELECT 
            s.name AS schema_name,
            t.name AS table_name,
            c.name AS column_name,
            ty.name AS data_type,
            c.max_length,
            c.precision,
            c.scale,
            c.is_nullable,
            CAST(prop.value AS NVARCHAR(MAX)) AS description
        FROM sys.tables t
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        INNER JOIN sys.columns c ON t.object_id = c.object_id
        INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        LEFT JOIN sys.extended_properties prop 
            ON prop.major_id = c.object_id 
            AND prop.minor_id = c.column_id 
            AND prop.name = 'MS_Description'
        WHERE t.type = 'U'
        """
        
        if schemas:
            schema_list = "','".join(schemas)
            query += f" AND s.name IN ('{schema_list}')"
        
        if tables:
            table_list = "','".join(tables)
            query += f" AND t.name IN ('{table_list}')"
        
        query += " ORDER BY s.name, t.name, c.column_id"
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # Get primary key information
        pk_query = """
        SELECT 
            s.name AS schema_name,
            t.name AS table_name,
            c.name AS column_name
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.is_primary_key = 1
        """
        cursor.execute(pk_query)
        pk_rows = cursor.fetchall()
        pk_set = {(row[0], row[1], row[2]) for row in pk_rows}
        
        # Get foreign key information
        fk_query = """
        SELECT 
            s.name AS schema_name,
            t.name AS table_name,
            c.name AS column_name
        FROM sys.foreign_key_columns fkc
        INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
        INNER JOIN sys.tables t ON fkc.parent_object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        """
        cursor.execute(fk_query)
        fk_rows = cursor.fetchall()
        fk_set = {(row[0], row[1], row[2]) for row in fk_rows}
        
        # Get check constraints (for allowed values)
        check_query = """
        SELECT 
            s.name AS schema_name,
            t.name AS table_name,
            c.name AS column_name,
            cc.definition AS check_constraint
        FROM sys.check_constraints cc
        INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        INNER JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
        """
        cursor.execute(check_query)
        check_rows = cursor.fetchall()
        check_map = {}
        for row in check_rows:
            key = (row[0], row[1], row[2])
            check_map[key] = row[3]
        
        cursor.close()
        
        # Build table structures
        tables_dict: Dict[tuple, SchemaTable] = {}
        
        for row in rows:
            schema_name, table_name, col_name, data_type, max_len, precision, scale, is_nullable, description = row
            
            table_key = (schema_name, table_name)
            if table_key not in tables_dict:
                tables_dict[table_key] = SchemaTable(table_name, schema_name)
            
            # Format data type
            if data_type in ('char', 'varchar', 'nchar', 'nvarchar'):
                if max_len == -1:
                    type_str = f"{data_type}(max)"
                else:
                    # For nchar/nvarchar, max_length is in bytes (2 per char)
                    if data_type.startswith('n'):
                        max_len = max_len // 2
                    type_str = data_type
                    actual_max_len = max_len
            elif data_type in ('decimal', 'numeric'):
                type_str = f"{data_type}({precision},{scale})"
                actual_max_len = None
            else:
                type_str = data_type
                actual_max_len = None
            
            # Get constraint info
            col_key = (schema_name, table_name, col_name)
            is_pk = col_key in pk_set
            is_fk = col_key in fk_set
            check_constraint = check_map.get(col_key, "")
            
            column = SchemaColumn(
                name=col_name,
                data_type=type_str,
                required=not is_nullable and not is_pk,  # PKs are implicitly required
                description=description or "",
                values=check_constraint,
                max_length=actual_max_len if 'actual_max_len' in locals() else None,
                is_primary_key=is_pk,
                is_foreign_key=is_fk,
            )
            
            tables_dict[table_key].add_column(column)
        
        return list(tables_dict.values())


class OracleConnector(SchemaConnector):
    """Oracle schema connector using cx_Oracle or oracledb."""
    
    def __init__(self, *args, service_name: Optional[str] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.service_name = service_name or self.database
        if not self.port:
            self.port = 1521
    
    def connect(self):
        """Connect to Oracle."""
        try:
            import oracledb
            self._driver = 'oracledb'
            dsn = oracledb.makedsn(self.host, self.port, service_name=self.service_name)
            self.connection = oracledb.connect(user=self.username, password=self.password, dsn=dsn)
        except ImportError:
            try:
                import cx_Oracle
                self._driver = 'cx_Oracle'
                dsn = cx_Oracle.makedsn(self.host, self.port, service_name=self.service_name)
                self.connection = cx_Oracle.connect(user=self.username, password=self.password, dsn=dsn)
            except ImportError:
                raise ImportError(
                    "Neither oracledb nor cx_Oracle is installed. "
                    "Install one with: pip install oracledb (or cx_Oracle)"
                )
    
    def extract_schema(self, schemas: Optional[List[str]] = None, tables: Optional[List[str]] = None) -> List[SchemaTable]:
        """Extract schema metadata from Oracle."""
        cursor = self.connection.cursor()
        
        # Use current user's schema if none specified
        if not schemas:
            cursor.execute("SELECT USER FROM DUAL")
            schemas = [cursor.fetchone()[0]]
        
        # Query for tables, columns, types, nullability
        query = """
        SELECT 
            cols.owner AS schema_name,
            cols.table_name,
            cols.column_name,
            cols.data_type,
            cols.data_length,
            cols.data_precision,
            cols.data_scale,
            cols.nullable,
            comm.comments AS description
        FROM all_tab_columns cols
        LEFT JOIN all_col_comments comm 
            ON cols.owner = comm.owner 
            AND cols.table_name = comm.table_name 
            AND cols.column_name = comm.column_name
        WHERE cols.owner IN ("""
        
        query += ",".join([f"'{s.upper()}'" for s in schemas])
        query += ")"
        
        if tables:
            table_list = "','".join([t.upper() for t in tables])
            query += f" AND cols.table_name IN ('{table_list}')"
        
        query += " ORDER BY cols.owner, cols.table_name, cols.column_id"
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # Get primary key information
        pk_query = """
        SELECT 
            cons.owner AS schema_name,
            cons.table_name,
            cols.column_name
        FROM all_constraints cons
        INNER JOIN all_cons_columns cols 
            ON cons.owner = cols.owner 
            AND cons.constraint_name = cols.constraint_name
        WHERE cons.constraint_type = 'P'
            AND cons.owner IN ("""
        pk_query += ",".join([f"'{s.upper()}'" for s in schemas])
        pk_query += ")"
        
        cursor.execute(pk_query)
        pk_rows = cursor.fetchall()
        pk_set = {(row[0], row[1], row[2]) for row in pk_rows}
        
        # Get foreign key information
        fk_query = """
        SELECT 
            cons.owner AS schema_name,
            cons.table_name,
            cols.column_name
        FROM all_constraints cons
        INNER JOIN all_cons_columns cols 
            ON cons.owner = cols.owner 
            AND cons.constraint_name = cols.constraint_name
        WHERE cons.constraint_type = 'R'
            AND cons.owner IN ("""
        fk_query += ",".join([f"'{s.upper()}'" for s in schemas])
        fk_query += ")"
        
        cursor.execute(fk_query)
        fk_rows = cursor.fetchall()
        fk_set = {(row[0], row[1], row[2]) for row in fk_rows}
        
        # Get check constraints
        check_query = """
        SELECT 
            cons.owner AS schema_name,
            cons.table_name,
            cols.column_name,
            cons.search_condition
        FROM all_constraints cons
        INNER JOIN all_cons_columns cols 
            ON cons.owner = cols.owner 
            AND cons.constraint_name = cols.constraint_name
        WHERE cons.constraint_type = 'C'
            AND cons.owner IN ("""
        check_query += ",".join([f"'{s.upper()}'" for s in schemas])
        check_query += ")"
        check_query += " AND cons.search_condition NOT LIKE '%NOT NULL%'"
        
        cursor.execute(check_query)
        check_rows = cursor.fetchall()
        check_map = {}
        for row in check_rows:
            key = (row[0], row[1], row[2])
            if key not in check_map:  # Keep first constraint if multiple
                check_map[key] = row[3]
        
        cursor.close()
        
        # Build table structures
        tables_dict: Dict[tuple, SchemaTable] = {}
        
        for row in rows:
            schema_name, table_name, col_name, data_type, data_len, precision, scale, nullable, description = row
            
            table_key = (schema_name, table_name)
            if table_key not in tables_dict:
                tables_dict[table_key] = SchemaTable(table_name, schema_name)
            
            # Format data type
            if data_type in ('VARCHAR2', 'CHAR', 'NVARCHAR2', 'NCHAR'):
                type_str = data_type.lower()
                actual_max_len = data_len
            elif data_type in ('NUMBER',):
                if precision and scale:
                    type_str = f"numeric({precision},{scale})"
                elif precision:
                    type_str = f"numeric({precision})"
                else:
                    type_str = "numeric"
                actual_max_len = None
            else:
                type_str = data_type.lower()
                actual_max_len = None
            
            # Get constraint info
            col_key = (schema_name, table_name, col_name)
            is_pk = col_key in pk_set
            is_fk = col_key in fk_set
            check_constraint = check_map.get(col_key, "")
            
            column = SchemaColumn(
                name=col_name,
                data_type=type_str,
                required=(nullable == 'N') and not is_pk,
                description=description or "",
                values=str(check_constraint) if check_constraint else "",
                max_length=actual_max_len if 'actual_max_len' in locals() else None,
                is_primary_key=is_pk,
                is_foreign_key=is_fk,
            )
            
            tables_dict[table_key].add_column(column)
        
        return list(tables_dict.values())


def export_to_mapbridge_json(tables: List[SchemaTable], system_name: str) -> Dict[str, Any]:
    """Convert extracted schema to MapBridge JSON format."""
    return {
        "system": system_name,
        "tables": [table.to_dict() for table in tables],
        "importedAt": datetime.utcnow().isoformat() + "Z",
    }


def print_summary(schema: Dict[str, Any]):
    """Print a human-readable summary of the extracted schema."""
    print("\n" + "="*60)
    print("SCHEMA EXTRACTION SUMMARY")
    print("="*60)
    print(f"System: {schema['system']}")
    print(f"Extracted at: {schema['importedAt']}")
    print(f"Total tables: {len(schema['tables'])}")
    
    total_columns = sum(len(table['columns']) for table in schema['tables'])
    print(f"Total columns: {total_columns}")
    
    print("\nTables:")
    for table in schema['tables']:
        print(f"  - {table['name']} ({len(table['columns'])} columns)")
    
    print("\n" + "="*60)
    print("✓ Schema metadata extracted successfully")
    print("✓ NO ROW DATA was read or accessed")
    print("✓ This file contains only table and column definitions")
    print("="*60 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="MapBridge Schema Connector - Extract database schema metadata (read-only, metadata-only)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # SQL Server with SQL authentication
  python mapbridge_connector.py --db-type sqlserver --host localhost \\
      --database AdventureWorks --username readonly_user --output schema.json
  
  # SQL Server with Windows authentication
  python mapbridge_connector.py --db-type sqlserver --host localhost \\
      --database AdventureWorks --windows-auth --output schema.json
  
  # Oracle
  python mapbridge_connector.py --db-type oracle --host localhost \\
      --service mydb --username readonly_user --output schema.json
  
  # Filter specific schemas/tables
  python mapbridge_connector.py --db-type sqlserver --host localhost \\
      --database mydb --username user --schemas dbo,stage --tables pupils,staff \\
      --output schema.json
        """
    )
    
    parser.add_argument('--version', action='version', version=f'%(prog)s {__version__}')
    parser.add_argument('--db-type', required=True, choices=['sqlserver', 'oracle'],
                       help='Database type')
    parser.add_argument('--host', required=True, help='Database host')
    parser.add_argument('--port', type=int, help='Database port (default: 1433 for SQL Server, 1521 for Oracle)')
    parser.add_argument('--database', help='Database name (SQL Server)')
    parser.add_argument('--service', help='Service name (Oracle)')
    parser.add_argument('--username', help='Database username (prompted if not provided)')
    parser.add_argument('--password', help='Database password (prompted if not provided; NOT RECOMMENDED on command line)')
    parser.add_argument('--windows-auth', action='store_true', help='Use Windows authentication (SQL Server only)')
    parser.add_argument('--schemas', help='Comma-separated list of schemas to include (default: all accessible)')
    parser.add_argument('--tables', help='Comma-separated list of tables to include (default: all)')
    parser.add_argument('--system-name', help='System name for output JSON (default: derived from database name)')
    parser.add_argument('--output', required=True, help='Output JSON file path')
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.db_type == 'sqlserver' and not args.database:
        parser.error("--database is required for SQL Server")
    
    if args.db_type == 'oracle' and not args.service and not args.database:
        parser.error("--service (or --database) is required for Oracle")
    
    # Get credentials
    if not args.windows_auth:
        if not args.username:
            args.username = input("Username: ")
        
        if not args.password:
            args.password = getpass.getpass("Password: ")
    
    # Parse filters
    schemas = args.schemas.split(',') if args.schemas else None
    tables = args.tables.split(',') if args.tables else None
    
    # Determine system name
    system_name = args.system_name or args.database or args.service or "Unknown"
    
    try:
        print(f"\nConnecting to {args.db_type} at {args.host}...")
        
        # Create connector
        if args.db_type == 'sqlserver':
            connector = SQLServerConnector(
                host=args.host,
                database=args.database,
                username=args.username or "",
                password=args.password or "",
                port=args.port,
                use_windows_auth=args.windows_auth,
            )
        else:  # oracle
            connector = OracleConnector(
                host=args.host,
                database=args.database or args.service,
                username=args.username,
                password=args.password,
                port=args.port,
                service_name=args.service,
            )
        
        with connector:
            print("✓ Connected successfully (read-only)")
            print("Extracting schema metadata...")
            
            tables_list = connector.extract_schema(schemas=schemas, tables=tables)
            
            if not tables_list:
                print("\n⚠ No tables found matching the filters.")
                sys.exit(1)
            
            print(f"✓ Extracted {len(tables_list)} tables")
            
            schema_json = export_to_mapbridge_json(tables_list, system_name)
            
            # Write output
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(schema_json, f, indent=2, ensure_ascii=False)
            
            print(f"✓ Wrote schema to {args.output}")
            
            # Print summary
            print_summary(schema_json)
            
            print(f"You can now import {args.output} into MapBridge.")
            print("After the migration is complete, delete this file and remove the connector.")
    
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
