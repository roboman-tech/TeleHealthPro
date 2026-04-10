"""initial_schema: users, patient_records, appointments, telehealth_sessions

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-04-07

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Create ENUM types once; columns must use create_type=False or Alembic emits CREATE TYPE again.
    userrole_type = postgresql.ENUM("patient", "provider", "admin", name="userrole")
    userrole_type.create(bind, checkfirst=True)
    userrole_col = postgresql.ENUM("patient", "provider", "admin", name="userrole", create_type=False)

    appointmentstatus_type = postgresql.ENUM(
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
        name="appointmentstatus",
    )
    appointmentstatus_type.create(bind, checkfirst=True)
    appointmentstatus_col = postgresql.ENUM(
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
        name="appointmentstatus",
        create_type=False,
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", userrole_col, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_provider_approved", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)

    op.create_table(
        "patient_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("demographics", postgresql.JSONB(astext_type=sa.Text()), server_default=text("'{}'::jsonb"), nullable=False),
        sa.Column("medical_history", postgresql.JSONB(astext_type=sa.Text()), server_default=text("'{}'::jsonb"), nullable=False),
        sa.Column("lab_results", postgresql.JSONB(astext_type=sa.Text()), server_default=text("'{}'::jsonb"), nullable=False),
        sa.Column("fhir_resource_refs", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_patient_records_patient_id"), "patient_records", ["patient_id"], unique=False)

    op.create_table(
        "appointments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", appointmentstatus_col, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_appointments_patient_id"), "appointments", ["patient_id"], unique=False)
    op.create_index(op.f("ix_appointments_provider_id"), "appointments", ["provider_id"], unique=False)
    op.create_index(op.f("ix_appointments_start_at"), "appointments", ["start_at"], unique=False)

    op.create_table(
        "telehealth_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("appointment_id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("secure_join_url", sa.String(length=2048), nullable=False),
        sa.Column("session_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=text("'{}'::jsonb"), nullable=False),
        sa.Column("activity_log", postgresql.JSONB(astext_type=sa.Text()), server_default=text("'[]'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_telehealth_sessions_appointment_id"), "telehealth_sessions", ["appointment_id"], unique=True)
    op.create_index(op.f("ix_telehealth_sessions_provider_id"), "telehealth_sessions", ["provider_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_telehealth_sessions_provider_id"), table_name="telehealth_sessions")
    op.drop_index(op.f("ix_telehealth_sessions_appointment_id"), table_name="telehealth_sessions")
    op.drop_table("telehealth_sessions")

    op.drop_index(op.f("ix_appointments_start_at"), table_name="appointments")
    op.drop_index(op.f("ix_appointments_provider_id"), table_name="appointments")
    op.drop_index(op.f("ix_appointments_patient_id"), table_name="appointments")
    op.drop_table("appointments")

    op.drop_index(op.f("ix_patient_records_patient_id"), table_name="patient_records")
    op.drop_table("patient_records")

    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    op.execute(text("DROP TYPE IF EXISTS appointmentstatus CASCADE"))
    op.execute(text("DROP TYPE IF EXISTS userrole CASCADE"))
