"""appointment reschedule_requested and no_show statuses



Revision ID: c3d4e5f6a8b9

Revises: b2c3d4e5f6a7

Create Date: 2026-04-08



"""



from typing import Sequence, Union



from alembic import op



revision: str = "c3d4e5f6a8b9"

down_revision: Union[str, None] = "b2c3d4e5f6a7"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None





def upgrade() -> None:

    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'reschedule_requested'")

    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'no_show'")





def downgrade() -> None:

    # PostgreSQL cannot remove enum values safely; leave types in place.

    pass


