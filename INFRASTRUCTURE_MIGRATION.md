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
- runtime deployed under Docker
- domain `albufeirashop.xyz` pointed to the droplet
- `Caddy` serving HTTPS with automatic Let's Encrypt renewal

Temporary operational note:

- password SSH access is currently enabled by request and should be disabled again after the migration settles

## Repo Files Added For Server Runtime

- [backend/Dockerfile.server](/Users/theanabioz/Documents/telegram-retail/backend/Dockerfile.server)
- [frontend/Dockerfile.server](/Users/theanabioz/Documents/telegram-retail/frontend/Dockerfile.server)
- [docker-compose.server.yml](/Users/theanabioz/Documents/telegram-retail/docker-compose.server.yml)
- [infra/Caddyfile](/Users/theanabioz/Documents/telegram-retail/infra/Caddyfile)
- [.env.server.example](/Users/theanabioz/Documents/telegram-retail/.env.server.example)
- [.dockerignore](/Users/theanabioz/Documents/telegram-retail/.dockerignore)
- [scripts/server/deploy.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/deploy.sh)
- [scripts/server/smoke-check.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/smoke-check.sh)
- [scripts/server/backup-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/backup-postgres.sh)
- [scripts/server/restore-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/restore-postgres.sh)

## What This Gives Us

- a server-native deployment path without deleting the current Vercel setup
- same backend code and same frontend code
- same Supabase project for now
- a future-ready optional Postgres container profile for self-hosting later
- auto-healing for unhealthy stateless containers
- bounded Docker logs to reduce disk growth
- reusable deploy/smoke scripts for lower-friction operations
- an explicit restore path for future self-hosted Postgres drills

## Current Runtime Notes

- `frontend` and `backend` are live on the droplet
- `Supabase` remains the production database in phase 1
- the self-hosted `postgres` profile exists but is not enabled yet
- `postgres-backup` is also profile-gated and will only run once we switch the database locally

## Suggested Next Steps

1. Run smoke tests against `https://albufeirashop.xyz`.
2. Add deploy helper scripts on the server path.
3. Keep validating real seller/admin flows on the new runtime.
4. Only after runtime confidence is high, plan the Postgres migration off Supabase.
5. Disable temporary password SSH access once no longer needed.

## Deploy Command

```bash
docker compose -f docker-compose.server.yml --env-file .env.server up -d --build
```

## Verify

- `https://albufeirashop.xyz/health`
- frontend loads
- auth works inside Telegram
- `scripts/server/smoke-check.sh albufeirashop.xyz`

## Future Self-Hosted Postgres Safety

When we switch the database from Supabase to the local `postgres` profile, the minimum safe loop should be:

1. take a fresh backup
2. verify the backup file exists on disk
3. restore it into the local Postgres profile with:

```bash
scripts/server/restore-postgres.sh /opt/telegram-retail/backups/manual/postgres_YYYY-MM-DD_HH-MM-SS.sql.gz --yes
```

4. run smoke checks again
5. only then point the backend to local Postgres as the primary database

This keeps the database migration itself reversible and testable instead of relying on unverified dumps.

## Rollback

Rollback remains simple because Supabase is still the database of record in phase 1.

Rollback steps:

1. Point traffic back to the current Vercel frontend.
2. Restore the old API origin if needed.
3. Stop the droplet deployment.

No data migration is required during phase 1 rollback because production data still lives in Supabase.
