#!/bin/bash
# ============================================================
#  Restauration d'une sauvegarde produite par backup-postgres.sh
#  Usage : bash deploy/restore-postgres.sh <fichier.sql.gz[.enc]> [base_cible] [--force]
#
#  - base_cible : par défaut DB_NAME de .env.prod. Conseil : restaurer d'abord
#    dans une base de contrôle (ex. yobante_colis_verif) pour vérifier le dump ;
#  - la restauration dans une base qui contient déjà des tables est refusée sans --force ;
#  - arrêter le backend avant de restaurer la base de production :
#      docker compose --env-file .env.prod -f docker-compose.prod.yml stop backend
# ============================================================
set -euo pipefail

FICHIER="${1:-}"
CIBLE="${2:-}"
FORCER=0
for arg in "$@"; do [ "$arg" = "--force" ] && FORCER=1; done
[ "$CIBLE" = "--force" ] && CIBLE=""

if [ -z "$FICHIER" ] || [ ! -f "$FICHIER" ]; then
  echo "Usage : bash deploy/restore-postgres.sh <fichier.sql.gz[.enc]> [base_cible] [--force]" >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
set -a; . ./.env.prod; set +a
CIBLE="${CIBLE:-$DB_NAME}"
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
PSQL="$COMPOSE exec -T postgres psql -U $DB_USER -v ON_ERROR_STOP=1"

# Crée la base cible si besoin, refuse d'écraser une base non vide sans --force
if ! $PSQL -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$CIBLE'" | grep -q 1; then
  $PSQL -d postgres -c "CREATE DATABASE \"$CIBLE\""
fi
TABLES=$($PSQL -d "$CIBLE" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")
if [ "$TABLES" -gt 0 ] && [ "$FORCER" -ne 1 ]; then
  echo "✗ La base $CIBLE contient déjà $TABLES table(s). Relancer avec --force pour la remplacer." >&2
  exit 1
fi
if [ "$TABLES" -gt 0 ]; then
  echo "▶ Réinitialisation du schéma public de $CIBLE"
  $PSQL -d "$CIBLE" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
fi

echo "▶ Restauration de $FICHIER dans $CIBLE"
if [[ "$FICHIER" == *.enc ]]; then
  : "${BACKUP_ENC_KEY:?BACKUP_ENC_KEY requis pour déchiffrer la sauvegarde}"
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$FICHIER" -pass env:BACKUP_ENC_KEY | gunzip | $PSQL -d "$CIBLE" -q
else
  gunzip -c "$FICHIER" | $PSQL -d "$CIBLE" -q
fi

echo "▶ Contrôle"
$PSQL -d "$CIBLE" -tAc 'SELECT count(*) || '"' migrations appliquées'"' FROM "SequelizeMeta"'
echo "✔ Restauration terminée"
