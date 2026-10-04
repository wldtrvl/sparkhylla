-- Minimal stand-ins for what Supabase provides, so the migrations run on plain Postgres
-- (tests/sql.test.ts in PGlite, scripts/gen-db-types.sh in Docker). Never run this on Supabase.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
