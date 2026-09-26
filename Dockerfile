# ============================================================
#  Yobante Colis API — image de production
#  Construite par docker-compose.prod.yml ; migrations appliquées au démarrage
#  par docker-entrypoint.sh (le conteneur ne démarre pas sur un schéma incomplet).
# ============================================================

# ── Étape 1 : dépendances de production uniquement ─────────────────────────
FROM node:22.20.0-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force

# ── Étape 2 : image d'exécution ─────────────────────────────────────────────
FROM node:22.20.0-slim AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

# Fins de ligne Windows neutralisées (dépôt cloné sous Windows) et script exécutable
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Jamais root à l'exécution
USER node
EXPOSE 3000

# Disponibilité réelle : /health répond 503 si la base est injoignable
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
