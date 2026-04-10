"""appointment visit documentation columns



Revision ID: d4e5f6a7b8c0

Revises: c3d4e5f6a8b9

Create Date: 2026-04-08



"""



from typing import Sequence, Union



import sqlalchemy as sa

from alembic import op



revision: str = "d4e5f6a7b8c0"

down_revision: Union[str, None] = "c3d4e5f6a8b9"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None





def upgrade() -> None:

    op.add_column("appointments", sa.Column("visit_notes", sa.Text(), nullable=True))

    op.add_column("appointments", sa.Column("diagnosis_summary", sa.Text(), nullable=True))

    op.add_column("appointments", sa.Column("care_plan", sa.Text(), nullable=True))

    op.add_column("appointments", sa.Column("follow_up_instructions", sa.Text(), nullable=True))

    op.add_column("appointments", sa.Column("internal_provider_note", sa.Text(), nullable=True))

    op.add_column("appointments", sa.Column("patient_after_visit_summary", sa.Text(), nullable=True))





def downgrade() -> None:

    op.drop_column("appointments", "patient_after_visit_summary")

    op.drop_column("appointments", "internal_provider_note")

    op.drop_column("appointments", "follow_up_instructions")

    op.drop_column("appointments", "care_plan")

    op.drop_column("appointments", "diagnosis_summary")

    op.drop_column("appointments", "visit_notes")


