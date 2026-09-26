require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/db');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const etatApplication = require('./utils/etatApplication');
const { demarrerJobs, arreterJobs } = require('./jobs');

// Charger toutes les associations de modèles
require('./models');

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    message: reason?.message ?? String(reason),
    stack: reason?.stack,
  });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
// Adresse d'écoute : 127.0.0.1 derrière un proxy en direct sur l'hôte, 0.0.0.0 en conteneur
const HOST = process.env.HOST || '0.0.0.0';
/** Délai laissé aux requêtes en cours et au proxy pour constater l'arrêt (503 sur /health). */
const DELAI_ARRET_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000;

(async () => {
  try {
    // En production, le schéma appartient aux migrations (docker-entrypoint.sh,
    // deploy.sh) : sync() y créait des tables hors migrations, en concurrence
    // entre les workers PM2 du mode cluster, sans jamais ajouter de colonne.
    // En développement, sync() crée les tables manquantes (jamais { alter: true },
    // qui produit un SQL invalide sur PostgreSQL pour les colonnes `unique`).
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      await sequelize.authenticate();
    } else {
      await sequelize.sync({ force: false });
    }
    logger.info(
      isProd
        ? 'DB connectée (mode production — schéma géré par les migrations)'
        : 'DB synchronisée (création des tables manquantes)'
    );

    const taches = demarrerJobs();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Serveur démarré sur ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
    // Garde les connexions keep-alive plus longtemps que le proxy (nginx : 65 s)
    server.keepAliveTimeout = 70000;
    server.headersTimeout = 71000;

    // Arrêt gracieux : /health passe en 503, les requêtes en cours se terminent,
    // puis la base et Redis sont fermés proprement.
    let arretEnCours = false;
    const arreter = (signal) => {
      if (arretEnCours) return;
      arretEnCours = true;
      logger.info(`Signal ${signal} reçu — arrêt en cours…`);
      etatApplication.signalerArret();
      arreterJobs(taches);

      server.close(async () => {
        try {
          await sequelize.close();
          if (redis) await redis.quit();
          logger.info('Connexions fermées proprement');
        } catch (_err) {
          /* arrêt de toute façon */
        }
        process.exit(0);
      });
      setTimeout(() => {
        logger.error(`Arrêt forcé après ${DELAI_ARRET_MS} ms`);
        process.exit(1);
      }, DELAI_ARRET_MS).unref();
    };

    process.on('SIGTERM', () => arreter('SIGTERM'));
    process.on('SIGINT', () => arreter('SIGINT'));
  } catch (err) {
    logger.error('Erreur lors du démarrage', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();
