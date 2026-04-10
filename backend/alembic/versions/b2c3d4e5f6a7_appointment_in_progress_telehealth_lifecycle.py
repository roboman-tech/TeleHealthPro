"""appointment in_progress + telehealth session lifecycle

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'in_progress'")

    ss = postgresql.ENUM(
        "ready",
        "patient_joined",
        "provider_joined",
        "live",
        "ended",
        "expired",
        name="telehealthsessionstatus",
    )
    ss.create(op.get_bind(), checkfirst=True)

    status_col = postgresql.ENUM(
        "ready",
        "patient_joined",
        "provider_joined",
        "live",
        "ended",
        "expired",
        name="telehealthsessionstatus",
        create_type=False,
    )
    op.add_column(
        "telehealth_sessions",
        sa.Column("status", status_col, nullable=False, server_default="ready"),
    )
    op.add_column(
        "telehealth_sessions",
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("telehealth_sessions", "ended_at")
    op.drop_column("telehealth_sessions", "status")
    ss = postgresql.ENUM(name="telehealthsessionstatus")
    ss.drop(op.get_bind(), checkfirst=True)
    # Cannot remove 'in_progress' from appointmentstatus safely in PostgreSQL
