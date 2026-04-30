"""
Run this once to initialize the database schema.
Usage: uv run python scripts/setup_db.py

Requires Postgres to be running (docker-compose up -d postgres).
"""
import asyncio
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
from doppel.config import settings


async def main():
    # Read the schema SQL
    schema_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "doppel", "brain", "db", "schemas.sql"
    )
    with open(schema_path) as f:
        schema_sql = f.read()

    # Connect using raw asyncpg (not SQLAlchemy) so we can run DDL easily
    # Strip the +asyncpg dialect prefix for direct asyncpg use
    raw_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting to: {raw_url.split('@')[1]}")  # hide credentials

    conn = await asyncpg.connect(raw_url)
    try:
        await conn.execute(schema_sql)
        print("Schema applied successfully.")
        print("\nTables created:")
        rows = await conn.fetch("""
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)
        for row in rows:
            print(f"  ✓ {row['tablename']}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
