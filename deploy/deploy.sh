#!/bin/bash
# ─── deploy.sh — Déploiement Yobante Colis API ───────────────────────────────
# Usage : bash deploy/deploy.sh [--mode docker|pm2]
set -euo pipefail

MODE="${1:-docker}"
if [[ "$1" == "--mode" ]]; then MODE="$2"; fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "▶ Mise à jour du code…"
git pull --rebase origin main

if [[ "$MODE" == "docker" ]]; then
  echo "▶ Build et démarrage Docker (prod)…"
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
  docker image prune -f
  echo "▶ Vérification health…"
  sleep 5
  curl -sf http://localhost:3000/health && echo " ✔ API opérationnelle" || echo " ✗ Health check échoué"

elif [[ "$MODE" == "pm2" ]]; then
  echo "▶ Installation des dépendances…"
  npm install --omit=dev
  echo "▶ Migrations…"
  npm run migrate
  echo "▶ Rechargement PM2…"
  pm2 reload ecosystem.config.js --env production --update-env
  pm2 save
  echo " ✔ Déploiement PM2 terminé"

else
  echo "Mode inconnu : $MODE (utiliser 'docker' ou 'pm2')"
  exit 1
fi
