"""drop hoyolab credentials

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-09 18:05:00.000000

The backend stopped calling HoYoLAB: every chronicle now arrives as a bundle the browser
extension captured and posted, so there is nothing left to authenticate with and no reason
to hold a user's session cookies at all. This drops the table that held them, the failure
timestamp that paced the sync that no longer exists, and the claim level that only had one
value left once claiming became import-only.

`downgrade` puts the three back, empty: the cookies themselves are gone for good, which is
the point of the change.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("hoyolab_credentials", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_hoyolab_credentials_account_uid"))

    op.drop_table("hoyolab_credentials")

    with op.batch_alter_table("account_keys", schema=None) as batch_op:
        batch_op.drop_column("claim_level")

    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("chronicle_failed_at")


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("chronicle_failed_at", sa.DateTime(timezone=True)))

    with op.batch_alter_table("account_keys", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "claim_level",
                sa.String(length=16),
                nullable=False,
                server_default="verified",
            )
        )

    op.create_table(
        "hoyolab_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_uid", sa.String(length=16), nullable=False),
        sa.Column("ltuid_v2", sa.String(length=32), nullable=False),
        sa.Column("encrypted_ltoken", sa.Text(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_uid"], ["accounts.uid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("hoyolab_credentials", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_hoyolab_credentials_account_uid"), ["account_uid"], unique=True
        )
