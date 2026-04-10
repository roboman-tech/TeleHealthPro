"""notification WS delivery fields

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-04-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_notifications", sa.Column("ws_push_status", sa.String(length=40), nullable=True))
    op.add_column("user_notifications", sa.Column("ws_push_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_notifications", sa.Column("ws_push_socket_count", sa.Integer(), nullable=True))
    op.create_index("ix_user_notifications_ws_push_status", "user_notifications", ["ws_push_status"])


def downgrade() -> None:
    op.drop_index("ix_user_notifications_ws_push_status", table_name="user_notifications")
    op.drop_column("user_notifications", "ws_push_socket_count")
    op.drop_column("user_notifications", "ws_push_at")
    op.drop_column("user_notifications", "ws_push_status")

