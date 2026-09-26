# ── Stage 1 : dépendances de production ───────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

COPY package*.json ./
# --ignore-scripts : le hook « prepare » (husky) ne sert qu'au développement
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2 : image finale légère ─────────────────────────────────────────────
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

# Copier les dépendances compilées depuis le stage précédent
COPY --from=deps /app/node_modules ./node_modules

# Copier le code source
COPY . .

# Utilisateur non-root pour limiter la surface d'attaque
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 3000

# Healthcheck intégré (utilisé par docker-compose et les orchestrateurs)
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Migrations (additives) puis démarrage : le schéma est à jour à chaque déploiement.
# « exec » remplace le shell par Node, qui reçoit donc directement SIGTERM (docker stop,
# redéploiement) et s'arrête proprement : fin des requêtes en cours, envois en attente,
# fermeture du pool. Via « npm start », npm s'interposait et le signal pouvait se perdre
# jusqu'au SIGKILL de Docker 10 s plus tard.
CMD ["sh", "-c", "node_modules/.bin/sequelize-cli db:migrate && exec node src/server.js"]
