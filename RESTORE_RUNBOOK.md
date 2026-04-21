# Telegram Retail Restore Runbook

Этот документ нужен для спокойного и повторяемого восстановления базы на сервере, без догадок и спешки.

Текущий production:

- домен: `https://albufeirashop.xyz`
- сервер: `167.172.169.171`
- база: self-hosted Postgres в Docker
- runtime: `frontend + backend + websocket + postgres` на одном droplet

## Когда какой сценарий использовать

### 1. SQL dump restore

Использовать, если:

- нужна простая полная замена базы на состояние из готового dump
- не нужен точный откат на конкретное время
- нужен быстрый и понятный recovery-сценарий

Скрипт:

```bash
scripts/server/restore-postgres.sh <backup-file.sql.gz|backup-file.sql> --yes
```

### 2. PITR restore

Использовать, если:

- нужно восстановиться на конкретный момент времени
- нужно откатить ошибочные действия, которые случились после base backup
- есть base backup и WAL archive

Скрипт:

```bash
scripts/server/pitr-restore-postgres.sh <base-backup-dir> '<recovery-target-time>' --yes
```

### 3. PITR drill

Использовать, если:

- нужно проверить recovery без риска для production
- нужно убедиться, что `base backup + WAL` реально работают

Скрипт:

```bash
scripts/server/pitr-drill-postgres.sh
```

## Перед любым destructive restore

Сделать обязательно:

1. Убедиться, что понимаешь, production ли ты собираешься трогать.
2. Снять свежий backup перед восстановлением.
3. Проверить, что нужный backup реально существует на диске.
4. Понять, к какому состоянию или времени нужно откатываться.
5. Зафиксировать текущее время и причину восстановления.

Проверки:

```bash
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171
cd /opt/telegram-retail/app
ls -lah /opt/telegram-retail/backups/manual | tail
ls -lah /opt/telegram-retail/backups/base | tail
ls -lah /opt/telegram-retail/backups/wal | tail
```

Свежий SQL backup:

```bash
retail-backup-postgres
```

Свежий base backup:

```bash
retail-basebackup-postgres
```

## Сценарий A: полное восстановление из SQL dump

### 1. Найти нужный backup

```bash
ls -1dt /opt/telegram-retail/backups/manual/postgres_* | head -n 10
```

### 2. Запустить restore

Пример:

```bash
cd /opt/telegram-retail/app
scripts/server/restore-postgres.sh /opt/telegram-retail/backups/manual/postgres_2026-04-21_03-00-01.sql.gz --yes
```

Что делает скрипт:

- поднимает `postgres`, если он не запущен
- дожидается readiness
- удаляет текущую `public` schema
- заливает SQL dump заново

### 3. Проверить базу после restore

```bash
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.users;"
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.stores;"
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.products;"
curl -sS https://albufeirashop.xyz/health
```

### 4. Быстрый smoke check

```bash
cd /opt/telegram-retail/app
scripts/server/smoke-check.sh albufeirashop.xyz
```

## Сценарий B: PITR восстановление на момент времени

### 1. Найти base backup

```bash
ls -1dt /opt/telegram-retail/backups/base/base_* | head -n 10
```

### 2. Выбрать recovery target time

Формат:

```bash
'2026-04-21 18:17:00+01'
```

Используй время Lisbon, если восстанавливаешься по бизнес-событиям.

### 3. Запустить PITR restore

Пример:

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-restore-postgres.sh /opt/telegram-retail/backups/base/base_2026-04-21_18-39-37 '2026-04-21 18:45:00+01' --yes
```

Что делает скрипт:

- останавливает `frontend`, `backend`, `postgres-backup`, `postgres`
- заменяет postgres data directory выбранным base backup
- включает `recovery.signal`
- прописывает `restore_command`
- прописывает `recovery_target_time`
- запускает `postgres` в recovery mode

### 4. Проверить, что Postgres восстановился и promoted

```bash
docker logs --tail 100 telegram-retail-postgres
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select pg_is_in_recovery();"
```

Ожидаем:

- во время recovery может быть `t`
- после завершения и promotion должно стать `f`

### 5. Поднять приложение обратно

```bash
cd /opt/telegram-retail/app
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml up -d backend frontend postgres-backup
```

### 6. Проверить состояние после восстановления

```bash
curl -sS https://albufeirashop.xyz/health
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.users;"
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.stores;"
docker exec telegram-retail-postgres psql -U telegram_retail -d telegram_retail -c "select count(*) from public.products;"
```

И затем:

```bash
cd /opt/telegram-retail/app
scripts/server/smoke-check.sh albufeirashop.xyz
```

## Сценарий C: безопасный drill

Это основной способ периодически проверять recovery без риска для production.

### Базовый запуск

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-drill-postgres.sh
```

Что делает:

- берет последний base backup
- поднимает временный recovery Postgres на `127.0.0.1:55432`
- дочитывает WAL
- проверяет чтение ключевых таблиц
- удаляет временные данные после успеха

### Если нужен drill на конкретную точку времени

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-drill-postgres.sh /opt/telegram-retail/backups/base/base_2026-04-21_18-39-37 '2026-04-21 18:45:00+01'
```

### Если нужно сохранить failed drill для разбора

```bash
cd /opt/telegram-retail/app
KEEP_FAILED_DRILL=true scripts/server/pitr-drill-postgres.sh
```

## Как понять, что восстановление прошло удачно

Минимальные признаки успеха:

- `postgres` healthy
- `curl https://albufeirashop.xyz/health` возвращает `ok: true`
- counts по ключевым таблицам выглядят разумно
- smoke-check проходит
- в UI открываются seller/admin flows без ошибок

## Что делать, если восстановили не ту точку

Если восстановили слишком поздно или слишком рано:

1. Не паниковать и не пытаться “чинить руками” поверх.
2. Снова выбрать правильный `base backup`.
3. Снова выбрать другой `recovery_target_time`.
4. Повторить PITR restore.

PITR для этого и нужен: это нормальный цикл, а не авария.

## Полезные команды

Статус контейнеров:

```bash
cd /opt/telegram-retail/app
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps
```

Логи backend:

```bash
docker logs --tail 100 telegram-retail-backend
```

Логи postgres:

```bash
docker logs --tail 150 telegram-retail-postgres
```

Логи caddy:

```bash
docker logs --tail 100 telegram-retail-caddy
```

Проверка WAL archive:

```bash
ls -lah /opt/telegram-retail/backups/wal | tail
```

Проверка base backups:

```bash
ls -1dt /opt/telegram-retail/backups/base/base_* | head -n 10
```

## Практическая рекомендация

Нормальный операционный ритм:

- `SQL dump` каждый день
- `base backup` каждый день
- `PITR drill` раз в неделю или после важных изменений в postgres/backup-логике

Так ты не просто “надеешься на backup”, а реально знаешь, что восстановление работает.
