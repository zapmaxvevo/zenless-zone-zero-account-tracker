from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from zzz_tracker.storage.models import Base


def get_or_create[Row: Base](session: Session, model: type[Row], **natural_key: Any) -> Row:
    """The row with that natural key, added to the session (unflushed) when there is none."""
    row = session.scalars(select(model).filter_by(**natural_key)).one_or_none()
    if row is None:
        row = model(**natural_key)
        session.add(row)
    return row


def copy_fields(target: object, source: object, fields: Sequence[str]) -> None:
    """Copy the named attributes across, for the rows whose columns mirror a parsed record."""
    for name in fields:
        setattr(target, name, getattr(source, name))
