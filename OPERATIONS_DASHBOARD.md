# Telegram Retail Operations Dashboard

Это короткая operational-шпаргалка для повседневного контроля сервера.

Используй ее как:

- ежедневную быструю проверку
- еженедельный более внимательный осмотр
- чек-лист после deploy или серверных изменений

Текущий production:

- домен: `https://albufeirashop.xyz`
- сервер: `167.172.169.171`
- runtime: `frontend + backend + websocket + postgres`

## Быстрый ежедневный check

Обычно достаточно этих 5 вещей.

### 1. Жив ли публичный health

```bash
curl -sS https://albufeirashop.xyz/health
```

Норма:

- приходит `{"ok":true,"service":"telegram-retail-backend"}`

### 1b. Жив ли internal backend

```bash
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171 'docker exec telegram-retail-backend wget -q -O - http://127.0.0.1:4000/health'
```

Норма:

- internal health отвечает даже если frontend/Caddy в моменте перезапускается

### 2. Все ли контейнеры healthy

```bash
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171
cd /opt/telegram-retail/app
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps
```

Норма:

- `frontend` healthy
- `backend` healthy
- `postgres` healthy
- `autoheal` up

### 3. Есть ли свежие backups

```bash
ls -1dt /opt/telegram-retail/backups/manual/postgres_* | head -n 3
ls -1dt /opt/telegram-retail/backups/base/base_* | head -n 3
```

Норма:

- есть свежий `SQL dump`
- есть свежий `base backup`

### 4. Пишется ли WAL archive

```bash
ls -lah /opt/telegram-retail/backups/wal | tail
```

Норма:

- появляются WAL files
- папка не пустая

### 5. Нормален ли диск

```bash
df -h /
docker system df
```

Норма:

- root disk не подбирается к лимиту
- Docker не разросся неожиданно

## Быстрый weekly check

Раз в неделю стоит сделать уже чуть более осмысленный проход.

### 1. Прогнать smoke check

```bash
cd /opt/telegram-retail/app
retail-smoke
```

### 2. Прогнать PITR drill

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-drill-postgres.sh
```

Норма:

- drill проходит успешно
- ключевые таблицы читаются

### 3. Проверить alert state

```bash
ls -la /opt/telegram-retail/state/alerts
ls -la /opt/telegram-retail/state/alerts/logs
```

Норма:

- нет неожиданных `.state` файлов
- в логах нет постоянных падений задач

### 4. Проверить, что cron на месте

```bash
cat /etc/cron.d/telegram-retail-ops
```

Норма:

- есть internal backend health check
- есть public health check
- есть disk check
- есть ssl check
- есть monitored SQL backup
- есть monitored base backup

### 5. Проверить SSL запас

```bash
retail-check-ssl-expiry
```

Норма:

- скрипт молча завершается без alert

## Check после deploy

После любого deploy или изменений в:

- `docker-compose`
- `postgres`
- `caddy`
- `backup scripts`
- `health checks`

проверь:

### 1. Контейнеры

```bash
cd /opt/telegram-retail/app
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps
```

### 2. Public и internal health

```bash
curl -sS https://albufeirashop.xyz/health
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171 'docker exec telegram-retail-backend wget -q -O - http://127.0.0.1:4000/health'
```

### 3. Backup layer

```bash
retail-backup-postgres
retail-basebackup-postgres
```

### 4. PITR drill

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-drill-postgres.sh
```

### 5. UI quick check

Проверить руками:

- seller login
- checkout
- shift open/close
- admin sales
- inventory

## Если пришел Telegram alert

### Backend internal health failed

Смотри:

```bash
docker logs --tail 100 telegram-retail-backend
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps
docker exec telegram-retail-backend wget -q -O - http://127.0.0.1:4000/health
```

### Public health failed

Смотри:

```bash
docker logs --tail 100 telegram-retail-caddy 2>/dev/null || true
docker logs --tail 100 telegram-retail-frontend
curl -sS https://albufeirashop.xyz/health
```

### Disk usage high

Смотри:

```bash
df -h
docker system df
du -sh /opt/telegram-retail/backups/* 2>/dev/null
```

### SQL backup failed / Base backup failed

Смотри:

```bash
tail -n 100 /var/log/telegram-retail-sql-backup.log
tail -n 100 /var/log/telegram-retail-basebackup.log
docker logs --tail 100 telegram-retail-postgres
```

### SSL expires soon

Смотри:

```bash
docker logs --tail 100 telegram-retail-caddy 2>/dev/null || true
retail-check-ssl-expiry
```

## Три самые полезные команды

Если не хочется помнить все:

### Состояние сервиса

```bash
curl -sS https://albufeirashop.xyz/health
```

### Состояние контейнеров

```bash
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171 'cd /opt/telegram-retail/app && docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps'
```

### Recovery confidence

```bash
ssh -i ~/.ssh/do_telegram_retail -o IdentitiesOnly=yes root@167.172.169.171 'cd /opt/telegram-retail/app && scripts/server/pitr-drill-postgres.sh'
```

## Что смотреть по ресурсам на 2 GB droplet

Пока вы на `2 GB RAM`, особенно полезно иногда смотреть:

```bash
free -h
uptime
docker stats --no-stream
```

Если увидим:

- частый swap pressure
- медленный deploy
- нестабильность postgres/backend

тогда уже будет понятный аргумент перейти на `4 GB`.

## Куда смотреть за подробностями

Подробное восстановление:

- [RESTORE_RUNBOOK.md](/Users/theanabioz/Documents/telegram-retail/RESTORE_RUNBOOK.md)

Более широкий hardening:

- [SERVER_HARDENING_CHECKLIST.md](/Users/theanabioz/Documents/telegram-retail/SERVER_HARDENING_CHECKLIST.md)

Общая инфраструктурная картина:

- [INFRASTRUCTURE_MIGRATION.md](/Users/theanabioz/Documents/telegram-retail/INFRASTRUCTURE_MIGRATION.md)
