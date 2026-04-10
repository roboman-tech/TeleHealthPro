-- Runs only on first container start (empty data volume).
-- Restores CREATE on public for local dev (PostgreSQL 15+ default is stricter).
GRANT ALL ON SCHEMA public TO postgres;
GRANT CREATE ON SCHEMA public TO PUBLIC;
