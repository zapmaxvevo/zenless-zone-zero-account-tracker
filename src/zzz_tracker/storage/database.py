from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from zzz_tracker.storage.models import Base


def normalize_database_url(database_url: str) -> str:
    """Pin the driver hosted Postgres URLs leave out.

    Neon, Supabase and Vercel Postgres all hand out `postgres://…` or `postgresql://…`.
    SQLAlchemy dropped the `postgres` dialect name years ago, and a bare `postgresql`
    resolves to psycopg2, which is not a dependency here — psycopg 3 is. A URL that names
    its own driver is left alone: if you wrote one, you meant it, and the import error that
    follows says so plainly.
    """
    url = make_url(database_url)
    if url.drivername not in ("postgres", "postgresql"):
        return database_url
    return url.set(drivername="postgresql+psycopg").render_as_string(hide_password=False)


class DatabaseManager:
    def __init__(self, database_url: str) -> None:
        self.database_url = normalize_database_url(database_url)
        self._ensure_parent_dir(self.database_url)
        self.engine = create_engine(
            self.database_url,
            future=True,
            connect_args=self._connect_args(self.database_url),
            **self._pool_args(self.database_url),
        )
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
            class_=Session,
        )

    def create_all(self) -> None:
        Base.metadata.create_all(self.engine)

    @staticmethod
    def _connect_args(database_url: str) -> dict[str, object]:
        # Note: SQLite ignores every `ON DELETE CASCADE` unless `PRAGMA foreign_keys=ON` is
        # issued per connection, and nothing here issues it. Locally the cascades you see in
        # the models are enforced by the ORM's `delete-orphan` alone; only Postgres, which is
        # where this deploys, enforces them in the database. Do not read a passing local test
        # as proof that a foreign key holds.
        url = make_url(database_url)
        if url.get_backend_name() == "sqlite":
            return {"check_same_thread": False}
        return {}

    @staticmethod
    def _pool_args(database_url: str) -> dict[str, Any]:
        """Keep no pool of our own against a network database.

        The API runs as serverless functions: a container handles one request and may be
        frozen or thrown away right after, so a pool held across invocations is mostly
        stale sockets, and many warm containers each holding one would eat the connection
        limit. Pooling belongs to the provider's pgbouncer endpoint instead (see
        `docs/DEPLOY.md`). SQLite keeps SQLAlchemy's default pool, which is what the local
        file database and the tests want.
        """
        if make_url(database_url).get_backend_name() == "sqlite":
            return {}
        return {"poolclass": NullPool}

    @staticmethod
    def _ensure_parent_dir(database_url: str) -> None:
        url = make_url(database_url)
        if url.get_backend_name() != "sqlite" or not url.database:
            return
        db_path = Path(url.database)
        if not db_path.is_absolute():
            db_path = Path.cwd() / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
