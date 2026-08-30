"""challenge entry layer

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-11 20:41:02.114950

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("challenge_run_entries", sa.Column("layer_index", sa.Integer(), nullable=True))
    op.add_column("challenge_run_entries", sa.Column("layer_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("challenge_run_entries", "layer_id")
    op.drop_column("challenge_run_entries", "layer_index")
