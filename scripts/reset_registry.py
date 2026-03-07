#!/usr/bin/env python3
"""CLI tool to reset the GPT Registry (F-14).

Truncates gpts and pipeline_log_entries tables.
Preserves sync_logs and categories.
"""

import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


async def reset(database_url: str):
    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession)

    async with session_factory() as db:
        await db.execute(text("DELETE FROM gpts"))
        await db.execute(text("DELETE FROM pipeline_log_entries"))
        await db.commit()

    await engine.dispose()
    print("Registry reset complete. GPTs and pipeline logs cleared.")
    print("Sync history and categories preserved.")


def main():
    import os

    url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://agentsorg:changeme@localhost:5432/agentsorg",
    )

    if "--yes" not in sys.argv:
        confirm = input("This will delete all GPT data. Continue? [y/N] ")
        if confirm.lower() != "y":
            print("Aborted.")
            sys.exit(0)

    asyncio.run(reset(url))


if __name__ == "__main__":
    main()
