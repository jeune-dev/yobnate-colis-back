require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/db');
const redis = require('./config/redis');
const JWTUtils = require('./utils/jwtUtils');
const logger = require('./utils/logger');
const etatApplication = require('./utils/etatApplication');
const arrierePlan = require('./utils/arrierePlan');
const { demarrerTaches } = require('./jobs/taches');

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

const PORT = process.env.PORT || 3000;
// Adresse d'écoute : 127.0.0.1 derrière un proxy en direct sur l'hôte, 0.0.0.0 en conteneur
const HOST = process.env.HOST || '0.0.0.0';
/** Délai maximal de l'arrêt gracieux avant arrêt forcé. */
const DELAI_ARRET_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000;

/**
 * Un client qui coupe sa connexion ne met pas fin au traitement côté serveur :
 * le serveur HTTP se croit vide et l'arrêt fermait le pool pendant que des
 * requêtes écrivaient encore (« getConnection … after closed », mesuré en test
 * de charge). On attend que le pool reste inactif 250 ms d'affilée.
 */
const attendreRequetes = async (delaiMs) => {
  const pool = sequelize.connectionManager.pool;
  const limite = Date.now() + delaiMs;
  let calmeDepuis = Date.now();
  while (Date.now() < limite) {
    if (pool.using > 0 || pool.waiting > 0) calmeDepuis = Date.now();
    else if (Date.now() - calmeDepuis >= 250) return;
    await new Promise((r) => setTimeout(r, 25));
  }
};

(async () => {
  try {
    // Le schéma appartient exclusivement aux migrations (docker-entrypoint.sh,
    // `npm start`, deploy.sh). Pas de sequelize.sync() : sur PostgreSQL chaque
    // sync() recréait les contraintes UNIQUE (21 index en double par démarrage).
    await sequelize.authenticate();
    logger.info('Connexion PostgreSQL établie');

    // Tâches planifiées : un seul processus les exécute par créneau (jobs/taches.js)
    const minuteurTaches = demarrerTaches();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Serveur démarré sur ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
    // Derrière Nginx (keepalive vers l'amont) : le keep-alive Node doit durer plus
    // longtemps que celui du proxy (60 s), sinon des 502 intermittents apparaissent.
    server.keepAliveTimeout = Number(process.env.HTTP_KEEPALIVE_TIMEOUT_MS) || 65000;
    server.headersTimeout = server.keepAliveTimeout + 1000;
    // Une requête (envoi de photos compris) ne peut pas occuper un socket plus de 2 min
    server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS) || 120000;

    // Arrêt gracieux : /ready passe en 503, les requêtes en cours se terminent,
    // les envois en file partent, puis la base et Redis sont fermés proprement.
    let arretEnCours = false;
    const arreter = (signal) => {
      if (arretEnCours) return;
      arretEnCours = true;
      logger.info(`Signal ${signal} reçu — arrêt en cours…`);
      etatApplication.signalerArret();
      clearInterval(minuteurTaches);

      server.close(async () => {
        try {
          await attendreRequetes(5000);
          await arrierePlan.vider(4000);
          await sequelize.close();
          await JWTUtils.fermer();
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
