#!/bin/bash
# ============================================================
#  Déploiement manuel de Yobante Colis API sur le VPS
#  Usage : bash deploy/deploy.sh [docker|pm2]      (défaut : docker)
#  Le déploiement automatique (GitHub Actions) suit le mode docker.
#  Prérequis : .env.prod présent à la racine du projet.
# ============================================================
set -euo pipefail

MODE="${1:-docker}"
[[ "$MODE" == "--mode" ]] && MODE="${2:-docker}"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f .env.prod ]]; then
  echo "✗ .env.prod introuvable dans $PROJECT_DIR (copier .env.example puis le remplir)" >&2
  exit 1
fi

echo "▶ Mise à jour du code…"
git pull --rebase origin main

attendre_sante() {
  echo "▶ Attente de la disponibilité (migrations incluses)…"
  for _ in $(seq 1 40); do
    if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
      echo "✔ API opérationnelle"
      return 0
    fi
    sleep 5
  done
  echo "✗ API non disponible après 200 s" >&2
  return 1
}

case "$MODE" in
  docker)
    COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
    echo "▶ Construction et démarrage (les migrations s'appliquent au démarrage du conteneur)…"
    $COMPOSE up -d --build --remove-orphans
    if ! attendre_sante; then
      $COMPOSE logs --tail=80 backend
      exit 1
    fi
    docker image prune -f >/dev/null
    ;;

  pm2)
    echo "▶ Dépendances de production…"
    npm ci --omit=dev --no-fund
    echo "▶ Migrations…"
    set -a; . ./.env.prod; set +a
    npm run migrate
    echo "▶ Rechargement PM2 (sans interruption)…"
    pm2 reload ecosystem.config.js --env production --update-env
    pm2 save
    attendre_sante
    ;;

  *)
    echo "Mode inconnu : $MODE (docker ou pm2)" >&2
    exit 1
    ;;
esac

echo "✔ Déploiement terminé"
