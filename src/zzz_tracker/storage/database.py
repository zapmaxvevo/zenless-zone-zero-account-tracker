from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from zzz_tracker.storage.models import Base


def normalize_database_url(database_url: str) -> str:
    """Pin psycopg 3 on the driverless `postgres://` URLs hosted Postgres hands out."""
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
        # SQLite ignores every `ON DELETE CASCADE` without a per-connection
        # `PRAGMA foreign_keys=ON`, and nothing here issues one.
        url = make_url(database_url)
        if url.get_backend_name() == "sqlite":
            return {"check_same_thread": False}
        return {}

    @staticmethod
    def _pool_args(database_url: str) -> dict[str, Any]:
        """Keep no pool of our own against a network database; SQLite keeps the default one."""
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
