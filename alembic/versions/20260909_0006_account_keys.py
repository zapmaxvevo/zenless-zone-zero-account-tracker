"""account keys

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-09 11:20:00.000000

Nothing is backfilled on purpose: an account that existed before this table has no owner and
stays read-only until somebody claims it.

When this was written, claiming had three levels (`unclaimed` / `provisional` / `verified`)
and two doors, `POST /accounts/{uid}/claim` and `zzz-tracker claim <uid>`. `0007` dropped
the levels along with that endpoint: ownership is now a yes or no, and it is an import of
the account's chronicle that grants it — see `docs/OWNERSHIP.md`. What is written below is
left exactly as it ran.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "account_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_uid", sa.String(length=16), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("claim_level", sa.String(length=16), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["account_uid"], ["accounts.uid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("account_keys", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_account_keys_account_uid"), ["account_uid"], unique=True
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("account_keys", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_account_keys_account_uid"))

    op.drop_table("account_keys")
