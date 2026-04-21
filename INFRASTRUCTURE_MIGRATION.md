# Telegram Retail Server Migration

## Current Strategy

The migration is intentionally reversible.

Phase 1 keeps the current data plane on Supabase while moving the runtime plane to a DigitalOcean droplet:

- frontend runs on the droplet
- backend runs on the droplet
- database remains on Supabase
- rollback remains a simple switch back to Vercel + Supabase

This avoids combining infrastructure migration with database migration.

## Current Droplet Baseline

Server: `167.172.169.171`

Completed on the droplet:

- Ubuntu packages upgraded
- 2 GB swap configured
- `ufw` enabled with:
  - `OpenSSH`
  - `80/tcp`
  - `443/tcp`
- Docker installed
- Docker Compose v2 installed
- SSH hardened with password auth disabled and root restricted to key auth

## Repo Files Added For Server Runtime

- [backend/Dockerfile.server](/Users/theanabioz/Documents/telegram-retail/backend/Dockerfile.server)
- [frontend/Dockerfile.server](/Users/theanabioz/Documents/telegram-retail/frontend/Dockerfile.server)
- [docker-compose.server.yml](/Users/theanabioz/Documents/telegram-retail/docker-compose.server.yml)
- [infra/Caddyfile](/Users/theanabioz/Documents/telegram-retail/infra/Caddyfile)
- [.env.server.example](/Users/theanabioz/Documents/telegram-retail/.env.server.example)
- [.dockerignore](/Users/theanabioz/Documents/telegram-retail/.dockerignore)

## What This Gives Us

- a server-native deployment path without deleting the current Vercel setup
- same backend code and same frontend code
- same Supabase project for now
- a future-ready optional Postgres container profile for self-hosting later

## Suggested Next Steps

1. Point the new `.xyz` domain to the droplet.
2. Copy `.env.server.example` to `.env.server` and fill real values.
3. Copy the repo to the droplet at `/opt/telegram-retail/app`.
4. Run:

```bash
docker compose -f docker-compose.server.yml --env-file .env.server up -d --build
```

5. Verify:
   - `https://your-domain/health`
   - frontend loads
   - auth works inside Telegram

## Rollback

Rollback remains simple because Supabase is still the database of record in phase 1.

Rollback steps:

1. Point traffic back to the current Vercel frontend.
2. Restore the old API origin if needed.
3. Stop the droplet deployment.

No data migration is required during phase 1 rollback because production data still lives in Supabase.
