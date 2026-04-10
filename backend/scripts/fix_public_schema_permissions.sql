-- "permission denied for schema public" when running: alembic upgrade head
-- (PostgreSQL 15+ removed implicit CREATE on schema public for ordinary roles.)
--
-- Connect as a superuser / role that can grant, e.g.:
--   psql -h localhost -U postgres -d telehealthpro -f scripts/fix_public_schema_permissions.sql
--
-- If DATABASE_URL uses user "postgres", this is usually enough:
GRANT USAGE, CREATE ON SCHEMA public TO postgres;

-- Local dev only — restores pre-15 behavior so any role can create in public:
-- GRANT CREATE ON SCHEMA public TO PUBLIC;

-- If your app uses another login, replace the name:
-- GRANT USAGE, CREATE ON SCHEMA public TO your_app_user;
