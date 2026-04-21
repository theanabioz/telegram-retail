# Telegram Retail Server Hardening Checklist

Этот файл не про “идеальную безопасность любой ценой”, а про спокойный и стабильный production с минимальным администрированием.

Текущее осознанное исключение:

- `PasswordAuthentication` пока остается включенным по вашему запросу
- это временно менее безопасно, но допустимо как операционный компромисс

## Уже сделано

- `Ubuntu` обновлен
- `Docker` установлен
- `Docker Compose v2` установлен
- `UFW` включен
- открыты только:
  - `OpenSSH`
  - `80`
  - `443`
- `swap 2 GB` добавлен
- `Caddy` выдает и продлевает SSL автоматически
- `frontend + backend + websocket + postgres` подняты на одном сервере
- `restart` политика контейнеров настроена
- `autoheal` поднят
- Docker logs ограничены по размеру
- `backup`, `base backup`, `PITR`, `restore drill` уже работают
- operational alert scripts добавлены
- offsite backup sync подготовлен в ready-to-enable виде

## Что держим в текущей конфигурации

### SSH

Оставляем пока:

- вход по `SSH key`
- вход по паролю
- `root` доступ по паролю временно разрешен

Почему это не идеально:

- парольный доступ повышает риск brute-force и утечки
- root-login по паролю хуже, чем ключи

Почему сейчас допустимо:

- это ваш осознанный временный выбор
- сервер уже прикрыт `UFW`
- домен и runtime уже запущены, а удобство доступа сейчас важно

Что важно хотя бы при таком режиме:

- не менять пароль на слабый
- не использовать этот пароль где-то еще
- не делиться им лишний раз

## Ближайшие полезные улучшения без боли

### 1. Telegram ops alerts

Стоит добавить уведомления в Telegram, если:

- `backend` стал unhealthy
- `base backup` упал
- `SQL dump` упал
- диск заполнился выше порога
- SSL renewal неожиданно не сработал

Это даст самый большой реальный комфорт.

Скрипты уже подготовлены:

- `scripts/server/send-telegram-alert.sh`
- `scripts/server/check-backend-health.sh`
- `scripts/server/check-disk-usage.sh`
- `scripts/server/check-ssl-expiry.sh`
- `scripts/server/run-monitored-job.sh`

Для установки symlink-ов и cron:

```bash
cd /opt/telegram-retail/app
scripts/server/install-ops-cron.sh
```

### 2. Проверка server reboot recovery

Нужно один раз осознанно проверить:

1. reboot droplet
2. дождаться старта
3. убедиться, что сами поднялись:
   - `caddy`
   - `frontend`
   - `backend`
   - `postgres`
   - `autoheal`
4. проверить:
   - `https://albufeirashop.xyz/health`
   - вход в приложение

Это один из самых полезных operational tests.

### 3. Удаление старых drill-артефактов

Хотя успешный drill за собой чистит, полезно периодически проверять:

```bash
ls -lah /opt/telegram-retail/pitr-drill
```

Если там скапливаются старые failed drills, их стоит вручную чистить.

### 4. Проверка backup retention

Периодически проверять:

```bash
ls -lah /opt/telegram-retail/backups/manual | tail
ls -lah /opt/telegram-retail/backups/base | tail
ls -lah /opt/telegram-retail/backups/wal | tail
```

И убеждаться, что retention реально работает, а диск не расползается.

## Что можно сделать позже, не прямо сейчас

### fail2ban

Можно добавить, но не обязательно первым делом.

Имеет смысл, если:

- парольный SSH остается надолго
- хочется дополнительной защиты от brute-force

### Отключение password SSH

Сейчас не делаем по вашему запросу.

Но это все равно останется самым полезным future-hardening шагом.

### Отдельный non-root deploy user

Можно потом перейти на схему:

- вход по ключу под обычным пользователем
- `sudo` только для админских задач

Это чище, но не обязательно делать прямо сейчас.

### Offsite backups

Сейчас backups лежат на том же droplet.

Это уже лучше, чем ничего, но в идеале потом стоит добавить вторую копию:

- DigitalOcean Spaces
- S3-compatible storage
- или другой внешний backup target

Это важнее многих “красивых” hardening-мер, потому что защищает от полной потери сервера.

Под это уже подготовлен скрипт:

- `scripts/server/offsite-sync-backups.sh`

Он включится, когда в `.env.server` будут заданы:

- `OFFSITE_BACKUP_ENABLED=true`
- `OFFSITE_S3_ENDPOINT`
- `OFFSITE_S3_BUCKET`
- `OFFSITE_AWS_ACCESS_KEY_ID`
- `OFFSITE_AWS_SECRET_ACCESS_KEY`

## Операционный чек-лист раз в неделю

Раз в неделю имеет смысл смотреть:

1. Контейнеры healthy ли:

```bash
cd /opt/telegram-retail/app
docker compose --profile selfhosted-db --env-file .env.server -f docker-compose.server.yml ps
```

2. Жив ли backend:

```bash
curl -sS https://albufeirashop.xyz/health
```

3. Идут ли backups:

```bash
ls -1dt /opt/telegram-retail/backups/manual/postgres_* | head -n 3
ls -1dt /opt/telegram-retail/backups/base/base_* | head -n 3
```

4. Пишется ли WAL:

```bash
ls -lah /opt/telegram-retail/backups/wal | tail
```

5. Не растут ли логи/диск:

```bash
df -h
docker system df
```

## Операционный чек-лист после каждого важного изменения

После изменений в:

- Postgres
- backup scripts
- Caddy
- deploy flow
- docker-compose

проверять:

1. deploy прошел
2. `/health` отвечает
3. UI открывается
4. backup still works
5. `pitr-drill-postgres.sh` still works

Это очень хорошая привычка: не считать recovery рабочим “по памяти”.

## Полезные команды

Deploy:

```bash
retail-deploy
```

Smoke check:

```bash
retail-smoke
```

SQL backup:

```bash
retail-backup-postgres
```

Base backup:

```bash
retail-basebackup-postgres
```

Restore from SQL:

```bash
retail-restore-postgres /opt/telegram-retail/backups/manual/postgres_YYYY-MM-DD_HH-MM-SS.sql.gz --yes
```

PITR drill:

```bash
cd /opt/telegram-retail/app
scripts/server/pitr-drill-postgres.sh
```

PITR restore:

```bash
retail-pitr-restore-postgres /opt/telegram-retail/backups/base/base_YYYY-MM-DD_HH-MM-SS '2026-04-21 18:45:00+01' --yes
```

Install ops cron:

```bash
cd /opt/telegram-retail/app
scripts/server/install-ops-cron.sh
```

## Что я бы считал следующим лучшим шагом

Если идти по уму и без лишнего перегруза, я бы следующим этапом сделал:

1. Telegram alerts на backup/health/disk
2. Один осознанный reboot test
3. Offsite backups

Это даст больше реальной надежности, чем десяток мелких security-тюнингов.

Для повседневной эксплуатации теперь есть отдельная короткая шпаргалка:

- [OPERATIONS_DASHBOARD.md](/Users/theanabioz/Documents/telegram-retail/OPERATIONS_DASHBOARD.md)
