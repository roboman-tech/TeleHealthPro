"""Declarative Base only — safe to import from Alembic without creating DB engines."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
