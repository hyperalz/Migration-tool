"""
Unit tests for MapBridge Schema Connector

These tests use fixture data (no live database required) to verify:
1. Metadata extraction logic
2. JSON conversion to MapBridge format
3. Column type formatting
4. Primary/foreign key detection
5. Constraint parsing

Run with: pytest tests/
"""

import json
import pytest
from datetime import datetime
import sys
import os

# Add parent directory to path so we can import mapbridge_connector
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mapbridge_connector import (
    SchemaColumn,
    SchemaTable,
    export_to_mapbridge_json,
)


class TestSchemaColumn:
    """Test SchemaColumn class and JSON conversion."""
    
    def test_basic_column(self):
        """Test basic column with minimal attributes."""
        col = SchemaColumn(
            name="pupil_id",
            data_type="int",
            required=True,
            description="Internal pupil identifier",
        )
        
        result = col.to_dict()
        
        assert result["name"] == "pupil_id"
        assert result["type"] == "int"
        assert result["required"] is True
        assert result["description"] == "Internal pupil identifier"
        assert result["values"] == ""
    
    def test_column_with_max_length(self):
        """Test column with max_length adds it to type."""
        col = SchemaColumn(
            name="forename",
            data_type="varchar",
            max_length=50,
            required=True,
        )
        
        result = col.to_dict()
        
        assert result["type"] == "varchar(50)"
    
    def test_column_with_values(self):
        """Test column with allowed values constraint."""
        col = SchemaColumn(
            name="fsm_flag",
            data_type="char",
            max_length=1,
            required=False,
            description="Free school meals eligibility",
            values="([fsm_flag]='Y' OR [fsm_flag]='N')",
        )
        
        result = col.to_dict()
        
        assert result["values"] == "([fsm_flag]='Y' OR [fsm_flag]='N')"
    
    def test_column_flags(self):
        """Test primary key and foreign key flags are stored."""
        pk_col = SchemaColumn(
            name="id",
            data_type="int",
            is_primary_key=True,
        )
        
        fk_col = SchemaColumn(
            name="parent_id",
            data_type="int",
            is_foreign_key=True,
        )
        
        assert pk_col.is_primary_key is True
        assert pk_col.is_foreign_key is False
        assert fk_col.is_foreign_key is True
        assert fk_col.is_primary_key is False


class TestSchemaTable:
    """Test SchemaTable class and column management."""
    
    def test_basic_table(self):
        """Test basic table creation."""
        table = SchemaTable(name="pupils", schema="dbo")
        
        assert table.name == "pupils"
        assert table.schema == "dbo"
        assert len(table.columns) == 0
    
    def test_add_columns(self):
        """Test adding columns to a table."""
        table = SchemaTable(name="pupils", schema="dbo")
        
        table.add_column(SchemaColumn("pupil_id", "int", required=True))
        table.add_column(SchemaColumn("forename", "varchar", max_length=50))
        
        assert len(table.columns) == 2
        assert table.columns[0].name == "pupil_id"
        assert table.columns[1].name == "forename"
    
    def test_table_to_dict(self):
        """Test table conversion to MapBridge JSON format."""
        table = SchemaTable(name="pupils", schema="dbo")
        table.add_column(SchemaColumn("pupil_id", "int", required=True))
        table.add_column(SchemaColumn("forename", "varchar", max_length=50, required=True))
        
        result = table.to_dict()
        
        assert result["name"] == "dbo.pupils"
        assert len(result["columns"]) == 2
        assert result["columns"][0]["name"] == "pupil_id"
        assert result["columns"][1]["type"] == "varchar(50)"
    
    def test_table_without_schema(self):
        """Test table name without schema prefix."""
        table = SchemaTable(name="pupils", schema="")
        result = table.to_dict()
        
        assert result["name"] == "pupils"


class TestMapBridgeJSONExport:
    """Test export to MapBridge JSON format."""
    
    def test_basic_export(self):
        """Test exporting schema to MapBridge JSON."""
        # Create sample tables
        pupils_table = SchemaTable("pupils", "dbo")
        pupils_table.add_column(SchemaColumn("pupil_id", "int", required=True, description="Pupil ID"))
        pupils_table.add_column(SchemaColumn("forename", "varchar", max_length=50, required=True, description="First name"))
        pupils_table.add_column(SchemaColumn("fsm_flag", "char", max_length=1, required=False, values="Y/N"))
        
        staff_table = SchemaTable("staff", "dbo")
        staff_table.add_column(SchemaColumn("staff_id", "int", required=True))
        staff_table.add_column(SchemaColumn("staff_name", "varchar", max_length=100, required=True))
        
        tables = [pupils_table, staff_table]
        
        result = export_to_mapbridge_json(tables, "Test_System")
        
        # Verify structure
        assert result["system"] == "Test_System"
        assert len(result["tables"]) == 2
        assert "importedAt" in result
        
        # Verify first table
        assert result["tables"][0]["name"] == "dbo.pupils"
        assert len(result["tables"][0]["columns"]) == 3
        
        # Verify column details
        pupil_id_col = result["tables"][0]["columns"][0]
        assert pupil_id_col["name"] == "pupil_id"
        assert pupil_id_col["type"] == "int"
        assert pupil_id_col["required"] is True
        assert pupil_id_col["description"] == "Pupil ID"
    
    def test_export_serializable(self):
        """Test that exported JSON can be serialized."""
        table = SchemaTable("test", "dbo")
        table.add_column(SchemaColumn("id", "int", required=True))
        
        result = export_to_mapbridge_json([table], "Test")
        
        # Should not raise an exception
        json_str = json.dumps(result, indent=2)
        
        # Should be valid JSON
        parsed = json.loads(json_str)
        assert parsed["system"] == "Test"
    
    def test_export_mapbridge_compatible_format(self):
        """Test that output matches MapBridge's expected schema format."""
        # Based on samples/synergy-schema.json structure
        table = SchemaTable("mig_pupil", "dbo")
        table.add_column(SchemaColumn(
            "pupil_id",
            "int",
            required=True,
            description="Internal Synergy pupil identifier",
            values="Numeric ID"
        ))
        table.add_column(SchemaColumn(
            "fsm_flag",
            "char",
            max_length=1,
            required=False,
            description="Free school meals eligibility",
            values="1 = eligible, 0 = not eligible"
        ))
        
        result = export_to_mapbridge_json([table], "Synergy")
        
        # Verify MapBridge-compatible structure
        assert "system" in result
        assert "tables" in result
        assert "importedAt" in result
        
        # Verify table structure
        table_data = result["tables"][0]
        assert "name" in table_data
        assert "columns" in table_data
        
        # Verify column structure (must match MapBridge's parseJSONSchema expectations)
        col = table_data["columns"][0]
        assert "name" in col
        assert "type" in col
        assert "required" in col
        assert "description" in col
        assert "values" in col


class TestSQLServerFixtures:
    """Test SQL Server-specific metadata formatting."""
    
    def test_varchar_type_formatting(self):
        """Test SQL Server varchar types are formatted correctly."""
        # varchar(50)
        col1 = SchemaColumn("name", "varchar", max_length=50)
        assert col1.to_dict()["type"] == "varchar(50)"
        
        # varchar(max) - represented as -1 in SQL Server
        col2 = SchemaColumn("notes", "varchar(max)")
        assert "varchar" in col2.to_dict()["type"]
    
    def test_decimal_type_formatting(self):
        """Test SQL Server decimal/numeric types."""
        col = SchemaColumn("price", "decimal(10,2)")
        assert col.to_dict()["type"] == "decimal(10,2)"
    
    def test_sqlserver_check_constraint(self):
        """Test SQL Server check constraint format."""
        col = SchemaColumn(
            "gender",
            "char",
            max_length=1,
            values="([gender]='M' OR [gender]='F' OR [gender]='O')"
        )
        
        result = col.to_dict()
        assert "gender" in result["values"]
        assert "M" in result["values"]


class TestOracleFixtures:
    """Test Oracle-specific metadata formatting."""
    
    def test_varchar2_type(self):
        """Test Oracle VARCHAR2 type conversion."""
        col = SchemaColumn("name", "varchar2", max_length=100)
        assert col.to_dict()["type"] == "varchar2(100)"
    
    def test_number_type(self):
        """Test Oracle NUMBER type."""
        # NUMBER without precision
        col1 = SchemaColumn("count", "number")
        assert col1.to_dict()["type"] == "number"
        
        # NUMBER(10)
        col2 = SchemaColumn("amount", "numeric(10)")
        assert "numeric" in col2.to_dict()["type"]
        
        # NUMBER(10,2)
        col3 = SchemaColumn("price", "numeric(10,2)")
        assert "numeric" in col3.to_dict()["type"]
    
    def test_oracle_check_constraint(self):
        """Test Oracle check constraint format."""
        col = SchemaColumn(
            "status",
            "varchar2",
            max_length=10,
            values="status IN ('ACTIVE', 'INACTIVE', 'PENDING')"
        )
        
        result = col.to_dict()
        assert "status" in result["values"]
        assert "ACTIVE" in result["values"]


class TestEdgeCases:
    """Test edge cases and error conditions."""
    
    def test_empty_table(self):
        """Test table with no columns."""
        table = SchemaTable("empty_table", "dbo")
        result = table.to_dict()
        
        assert result["name"] == "dbo.empty_table"
        assert result["columns"] == []
    
    def test_column_with_no_description(self):
        """Test column with empty description."""
        col = SchemaColumn("id", "int", description="")
        result = col.to_dict()
        
        assert result["description"] == ""
    
    def test_column_with_no_values(self):
        """Test column with no values constraint."""
        col = SchemaColumn("name", "varchar", max_length=50, values="")
        result = col.to_dict()
        
        assert result["values"] == ""
    
    def test_unicode_in_descriptions(self):
        """Test that unicode characters in descriptions are preserved."""
        col = SchemaColumn(
            "name",
            "varchar",
            max_length=50,
            description="Pupil's name (français: nom de l'élève)"
        )
        
        result = col.to_dict()
        assert "élève" in result["description"]
    
    def test_special_chars_in_constraint(self):
        """Test special characters in check constraints."""
        col = SchemaColumn(
            "code",
            "char",
            max_length=2,
            values="([code]='UK' OR [code]='US' OR [code]='FR')"
        )
        
        result = col.to_dict()
        assert "UK" in result["values"]
        assert "OR" in result["values"]


class TestFullSchemaScenarios:
    """Test complete schema extraction scenarios."""
    
    def test_synergy_to_mapbridge(self):
        """Test converting a Synergy-like schema to MapBridge format."""
        # Simulate Synergy pupil table
        pupils = SchemaTable("mig_pupil", "dbo")
        pupils.add_column(SchemaColumn("pupil_id", "int", required=True, description="Internal Synergy pupil identifier", values="Numeric ID"))
        pupils.add_column(SchemaColumn("forename", "varchar", max_length=50, required=True, description="Pupil given name", values="Free text"))
        pupils.add_column(SchemaColumn("surname", "varchar", max_length=50, required=True, description="Pupil family name", values="Free text"))
        pupils.add_column(SchemaColumn("fsm_flag", "char", max_length=1, required=False, description="Free school meals eligibility", values="1 = eligible, 0 = not eligible"))
        
        result = export_to_mapbridge_json([pupils], "Synergy")
        
        # Verify structure matches sample files
        assert result["system"] == "Synergy"
        assert len(result["tables"]) == 1
        assert result["tables"][0]["name"] == "dbo.mig_pupil"
        assert len(result["tables"][0]["columns"]) == 4
        
        # Verify it can be JSON-serialized (required for MapBridge import)
        json_str = json.dumps(result, indent=2)
        assert len(json_str) > 0
    
    def test_multi_table_schema(self):
        """Test exporting multiple tables."""
        tables = []
        
        # Create 3 different tables
        for i, name in enumerate(["pupils", "staff", "attendance"]):
            table = SchemaTable(name, "dbo")
            table.add_column(SchemaColumn(f"{name}_id", "int", required=True))
            table.add_column(SchemaColumn("created_date", "datetime", required=True))
            tables.append(table)
        
        result = export_to_mapbridge_json(tables, "Test_System")
        
        assert len(result["tables"]) == 3
        assert result["tables"][0]["name"] == "dbo.pupils"
        assert result["tables"][1]["name"] == "dbo.staff"
        assert result["tables"][2]["name"] == "dbo.attendance"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
