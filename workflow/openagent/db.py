"""
OpenAgent Database Connection
─────────────────────────────
Primary:  PostgreSQL (asyncpg)
Fallback: SQLite (aiosqlite) — used when Postgres is unavailable locally

The fallback keeps the workflow server startable even without a running
Postgres instance. Sales data will be seeded from the mock values in
db_service.py if the SQLite file is empty.
"""
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# ── Connection selection ───────────────────────────────────────────────────────
# Override via env var:  DATABASE_URL=postgresql+asyncpg://...
_env_url = os.getenv("OPENAGENT_DATABASE_URL", "").strip()

if _env_url:
    DATABASE_URL = _env_url
    _backend = "env"
else:
    # Default: try Postgres; if the env var isn't set we use SQLite fallback
    _POSTGRES_URL = (
        "postgresql+asyncpg://neelakshabhardwaj:123sonu@localhost:5432/mydb"
    )
    # Use SQLite when explicitly requested or as the default local fallback
    _SQLITE_PATH = Path(__file__).resolve().parent.parent / "openagent_sales.db"
    DATABASE_URL = f"sqlite+aiosqlite:///{_SQLITE_PATH}"
    _backend = "sqlite-fallback"

print(f"[openagent.db] Using database backend: {_backend}  ->  {DATABASE_URL[:60]}...")

# ── Engine + session factory ───────────────────────────────────────────────────
_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,          # set True to see all SQL queries in console
    connect_args=_connect_args,
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)