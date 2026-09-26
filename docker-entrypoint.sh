#!/bin/sh
# ============================================================
#  Démarrage du conteneur (approche Widjila) :
#   1. attendre PostgreSQL ;
#   2. appliquer les migrations (sequelize-cli, table SequelizeMeta) ;
#   3. lancer la commande (CMD).
#  Un échec de migration empêche le démarrage : le serveur ne sert jamais de
#  trafic sur un schéma incomplet. Un simple redémarrage migre aussi.
# ============================================================
set -e

echo "[entrypoint] Démarrage — $(date '+%Y-%m-%d %H:%M:%S')"

ATTENTE_MAX="${DB_WAIT_SECONDS:-60}"
i=0
until node -e "require('/app/src/config/db').authenticate().then(() => process.exit(0), () => process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge "$ATTENTE_MAX" ]; then
    echo "[entrypoint] ERREUR : PostgreSQL injoignable après ${ATTENTE_MAX}s — abandon." >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] PostgreSQL disponible après ${i}s"

echo "[entrypoint] Application des migrations…"
if ! ./node_modules/.bin/sequelize-cli db:migrate; then
  echo "[entrypoint] ÉCHEC DES MIGRATIONS — le conteneur ne démarrera pas." >&2
  echo "[entrypoint] Diagnostic : docker compose -f docker-compose.prod.yml run --rm --entrypoint sh backend -c './node_modules/.bin/sequelize-cli db:migrate:status'" >&2
  exit 1
fi
echo "[entrypoint] Migrations à jour."

exec "$@"
