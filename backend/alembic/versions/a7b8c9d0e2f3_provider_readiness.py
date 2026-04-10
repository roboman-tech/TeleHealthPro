"""provider_readiness on users

Revision ID: a7b8c9d0e2f3
Revises: f6a7b8c9d0e2
Create Date: 2026-04-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import text

revision: str = "a7b8c9d0e2f3"
down_revision: Union[str, None] = "f6a7b8c9d0e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    readiness_type = postgresql.ENUM(
        "registered",
        "profile_completed",
        "credentials_reviewed",
        "approved",
        "bookable",
        name="providerreadiness",
    )
    readiness_type.create(bind, checkfirst=True)
    readiness_col = postgresql.ENUM(
        "registered",
        "profile_completed",
        "credentials_reviewed",
        "approved",
        "bookable",
        name="providerreadiness",
        create_type=False,
    )

    op.add_column("users", sa.Column("provider_readiness", readiness_col, nullable=True))
    op.create_index("ix_users_provider_readiness", "users", ["provider_readiness"])

    # Backfill from current booleans + availability windows.
    op.execute(
        text(
            """
            UPDATE users u
            SET provider_readiness =
              CASE
                WHEN u.role <> 'provider' THEN NULL
                WHEN u.is_provider_approved IS NOT TRUE THEN 'registered'::providerreadiness
                WHEN u.is_active IS NOT TRUE THEN 'approved'::providerreadiness
                WHEN EXISTS (SELECT 1 FROM provider_availability pa WHERE pa.provider_id = u.id)
                  THEN 'bookable'::providerreadiness
                ELSE 'approved'::providerreadiness
              END
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_users_provider_readiness", table_name="users")
    op.drop_column("users", "provider_readiness")
    op.execute(text("DROP TYPE IF EXISTS providerreadiness CASCADE"))

