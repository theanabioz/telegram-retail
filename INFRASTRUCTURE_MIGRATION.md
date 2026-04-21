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
- [scripts/server/basebackup-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/basebackup-postgres.sh)
- [scripts/server/restore-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/restore-postgres.sh)
- [scripts/server/pitr-restore-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/pitr-restore-postgres.sh)
- [scripts/server/pitr-drill-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/pitr-drill-postgres.sh)
- [scripts/server/bootstrap-postgres.sh](/Users/theanabioz/Documents/telegram-retail/scripts/server/bootstrap-postgres.sh)

## What This Gives Us

- a server-native deployment path without deleting the current Vercel setup
- same backend code and same frontend code
- same Supabase project for now
- a future-ready optional Postgres container profile for self-hosting later
- auto-healing for unhealthy stateless containers
- bounded Docker logs to reduce disk growth
- reusable deploy/smoke scripts for lower-friction operations
- an explicit restore path for future self-hosted Postgres drills
- WAL archive support for point-in-time style recovery groundwork

## Current Runtime Notes

- `frontend` and `backend` are live on the droplet
- `Supabase` remains the production database in phase 1
- the self-hosted `postgres` profile exists but is not enabled yet
- `postgres-backup` is also profile-gated and will only run once we switch the database locally

## Backup Philosophy For Self-Hosted Postgres

The right answer to “backup after every action” is not a full dump on every write.

Instead:

- nightly SQL dump backups remain useful for simple disaster recovery
- WAL archive gives us compact change history between dumps
- that is much closer to “full history” while being far cheaper than dumping the whole database after every mutation

For the self-hosted profile we now prepare both:

- `postgres-backup` for scheduled dump backups
- WAL files archived under `/opt/telegram-retail/backups/wal`
- periodic base backups under `/opt/telegram-retail/backups/base`

## PITR Layer

We now prepare the proper PostgreSQL recovery stack:

- SQL dumps for simple full restores
- WAL archive for change history
- base backups for point-in-time recovery anchors

That gives us a Git-like recovery model for the database:

- nightly or manual full checkpoints
- continuous WAL changes between them
- restore to a chosen timestamp instead of only “last dump wins”

### Manual Base Backup

```bash
scripts/server/basebackup-postgres.sh
```

This writes a new base backup into:

```bash
/opt/telegram-retail/backups/base/base_YYYY-MM-DD_HH-MM-SS
```

Recommended production setup:

- keep SQL dumps in the `postgres-backup` container
- schedule `scripts/server/basebackup-postgres.sh` from host cron once per day
- retain WAL files for at least the same recovery window as base backups

### PITR Restore

```bash
scripts/server/pitr-restore-postgres.sh \
  /opt/telegram-retail/backups/base/base_YYYY-MM-DD_HH-MM-SS \
  '2026-04-21 18:17:00+01' \
  --yes
```

This will:

- stop app containers
- replace the Postgres data directory from a chosen base backup
- instruct PostgreSQL to replay WAL files until the requested timestamp
- start PostgreSQL in recovery mode

After validation, bring app containers back:

```bash
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml up -d backend frontend postgres-backup
```

### Safe PITR Drill

To verify recovery without touching production:

```bash
scripts/server/pitr-drill-postgres.sh
```

This will:

- pick the latest base backup by default
- replay WAL into a temporary PostgreSQL instance on `127.0.0.1:55432`
- verify the database opens and core tables are readable
- remove the temporary drill container and data directory afterwards

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

1. enable the self-hosted Postgres profile
2. bootstrap schema and seed with:

```bash
scripts/server/bootstrap-postgres.sh
```

3. take a fresh backup
4. verify the backup file exists on disk
5. restore it into the local Postgres profile with:

```bash
scripts/server/restore-postgres.sh /opt/telegram-retail/backups/manual/postgres_YYYY-MM-DD_HH-MM-SS.sql.gz --yes
```

6. also verify PITR inputs exist:

```bash
ls -lah /opt/telegram-retail/backups/base
ls -lah /opt/telegram-retail/backups/wal
```

7. if needed, test point-in-time recovery with:

```bash
scripts/server/pitr-restore-postgres.sh /opt/telegram-retail/backups/base/base_YYYY-MM-DD_HH-MM-SS '2026-04-21 18:17:00+01' --yes
```

8. run smoke checks again
9. only then point the backend to local Postgres as the primary database

This keeps the database migration itself reversible and testable instead of relying on unverified dumps.

## Rollback

Rollback remains simple because Supabase is still the database of record in phase 1.

Rollback steps:

1. Point traffic back to the current Vercel frontend.
2. Restore the old API origin if needed.
3. Stop the droplet deployment.

No data migration is required during phase 1 rollback because production data still lives in Supabase.
