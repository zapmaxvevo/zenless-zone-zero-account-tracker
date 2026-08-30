"""agent build snapshots

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-30 10:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "agent_build_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_uid", sa.String(length=16), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["account_uid"], ["accounts.uid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_uid", "game_id", name="uq_agent_build_snapshots_account_game"),
    )
    with op.batch_alter_table("agent_build_snapshots", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_agent_build_snapshots_account_uid"), ["account_uid"], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("agent_build_snapshots", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_agent_build_snapshots_account_uid"))

    op.drop_table("agent_build_snapshots")
