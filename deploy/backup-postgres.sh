#!/bin/bash
# ============================================================
#  Sauvegarde PostgreSQL de Yobante Colis
#  Usage : bash deploy/backup-postgres.sh
#  Cron quotidien (root) :
#    30 2 * * * cd /var/www/yobante-colis && bash deploy/backup-postgres.sh >> /var/log/yobante-backup.log 2>&1
#
#  - dump au format texte compressé (restauration : deploy/restore-postgres.sh) ;
#  - chiffré (AES-256) si BACKUP_ENC_KEY est défini dans .env.prod — recommandé
#    dès que la sauvegarde quitte le serveur ;
#  - copie distante via rclone (remote « gdrive ») si disponible ;
#  - rétention locale : BACKUP_RETENTION_DAYS jours (14 par défaut).
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
set -a; . ./.env.prod; set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/yobante-colis}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
HORODATAGE=$(date +"%Y%m%d_%H%M%S")
FICHIER="$BACKUP_DIR/colis_${HORODATAGE}.sql.gz"
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "▶ [$(date '+%F %T')] Dump de la base $DB_NAME"
if $COMPOSE ps --status running postgres >/dev/null 2>&1 && [ -n "$($COMPOSE ps -q postgres)" ]; then
  $COMPOSE exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner | gzip > "$FICHIER"
else
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "${DB_HOST:-127.0.0.1}" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME" --no-owner | gzip > "$FICHIER"
fi

# Un dump vide signale un échec silencieux de pg_dump
if [ "$(gzip -dc "$FICHIER" | head -c 100 | wc -c)" -lt 100 ]; then
  echo "✗ Sauvegarde vide : abandon" >&2
  rm -f "$FICHIER"
  exit 1
fi

if [ -n "${BACKUP_ENC_KEY:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$FICHIER" -out "$FICHIER.enc" -pass env:BACKUP_ENC_KEY
  rm -f "$FICHIER"
  FICHIER="$FICHIER.enc"
fi
chmod 600 "$FICHIER"
echo "✔ Sauvegarde : $FICHIER ($(du -h "$FICHIER" | cut -f1))"

if command -v rclone >/dev/null 2>&1; then
  rclone copy "$FICHIER" "gdrive:backups/yobante-colis/" && echo "✔ Copie distante effectuée"
else
  echo "⚠ rclone absent : sauvegarde conservée uniquement sur ce serveur"
fi

find "$BACKUP_DIR" -name "colis_*.sql.gz*" -mtime +"$RETENTION_DAYS" -delete
echo "✔ Rétention appliquée ($RETENTION_DAYS jours)"
