require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/db');
const logger = require('./config/logger');

// Charger toutes les associations de modèles
require('./models/index');
const { startPurgeJob } = require('./utils/purgeExpiredTokens');
const { demarrerTaches } = require('./jobs/taches');

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
// MED-06 : adresse bind configurable via env (127.0.0.1 derrière un proxy, 0.0.0.0 en direct)
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
  try {
    // Le schéma est géré exclusivement par les migrations (`npm start` les exécute).
    // Pas de sequelize.sync() ici : sur PostgreSQL, chaque sync() recréait les
    // contraintes UNIQUE des colonnes (users_email_key1, _key2…), soit 21 index en
    // double à chaque démarrage, qui ralentissaient toutes les écritures.
    await sequelize.authenticate();
    logger.info('Connexion PostgreSQL établie');

    startPurgeJob();
    // Propositions expirées, délais d'étude, tournées passées, relances de factures…
    demarrerTaches();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Serveur démarré sur ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
    // Derrière Nginx (keepalive vers l'upstream) : le keep-alive Node doit durer plus
    // longtemps que celui du proxy (60 s), sinon Node ferme une connexion que Nginx
    // réutilise au même instant, d'où des 502 intermittents. Défaut Node : 5 s.
    server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 65000;
    server.headersTimeout = server.keepAliveTimeout + 1000;
    // Une requête (envoi de photos compris) ne peut pas occuper un socket plus de 2 min
    server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 120000;

    // Résilience : graceful shutdown sur SIGTERM et SIGINT
    const shutdown = (signal) => {
      logger.info(`Signal ${signal} reçu — arrêt en cours…`);
      server.close(async () => {
        try {
          await sequelize.close();
          logger.info('Connexion DB fermée proprement');
        } catch (_err) {
          /* ignore */
        }
        process.exit(0);
      });
      // Forcer l'arrêt après 10s si le serveur ne se ferme pas
      setTimeout(() => {
        logger.error('Arrêt forcé après timeout de 10s');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Erreur lors du démarrage', { message: err.message, stack: err.stack });
    process.exit(1);
  }
})();
