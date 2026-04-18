# Supabase Setup

## Current Status
- Supabase project URL is already connected in local backend env.
- Supabase anon key is already configured locally.
- Supabase service role key is already configured locally.
- Backend JWT secret is already generated locally.

## Still Needed
- Telegram `BOT_TOKEN` for validating Telegram Mini App `initData`.
- Supabase database password if we want to apply migrations directly from terminal tooling.

## Local Backend Env
- File: `backend/.env`

## What To Do In Supabase
- Open SQL Editor in your Supabase project.
- Run [supabase/migrations/0001_init_schema.sql](supabase/migrations/0001_init_schema.sql)
- Then run [supabase/migrations/0002_seed_demo.sql](supabase/migrations/0002_seed_demo.sql)

## Why Manual SQL Is The Fastest Right Now
- `psql` is not installed locally.
- `supabase` CLI is not installed locally.
- Remote migration from terminal would still require database connection credentials.

## After SQL Is Applied
- Share the Telegram `BOT_TOKEN`.
- If you want, also share the Supabase database password and I can automate later checks from terminal tooling.
- Then we can start the backend and verify:
  - health endpoint
  - Supabase connectivity
  - auth flow shape
  - next shift endpoints
