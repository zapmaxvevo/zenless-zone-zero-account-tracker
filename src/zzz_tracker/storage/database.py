from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from zzz_tracker.storage.models import Base


class DatabaseManager:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self._ensure_parent_dir(database_url)
        self.engine = create_engine(
            database_url,
            future=True,
            connect_args=self._connect_args(database_url),
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
        url = make_url(database_url)
        if url.get_backend_name() == "sqlite":
            return {"check_same_thread": False}
        return {}

    @staticmethod
    def _ensure_parent_dir(database_url: str) -> None:
        url = make_url(database_url)
        if url.get_backend_name() != "sqlite" or not url.database:
            return
        db_path = Path(url.database)
        if not db_path.is_absolute():
            db_path = Path.cwd() / db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
