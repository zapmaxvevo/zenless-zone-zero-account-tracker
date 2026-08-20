"""chronicle import source

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-19 11:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "accounts", sa.Column("chronicle_import_source", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("accounts", "chronicle_import_source")
