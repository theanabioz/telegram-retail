-- Self-hosted PostgreSQL compatibility prelude.
-- Supabase migrations rely on auth.jwt() existing for helper SQL functions and RLS policies.
-- In the self-hosted server path our backend connects as a trusted role and does not rely on RLS,
-- so an empty auth.jwt() stub is enough to keep the schema compatible.

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select '{}'::jsonb
$$;
