require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/db');
const logger = require('./config/logger');

// Charger toutes les associations de modèles
require('./models/index');
const { startPurgeJob } = require('./utils/purgeExpiredTokens');

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { message: reason?.message ?? String(reason), stack: reason?.stack });
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
    // En production : ne jamais altérer le schéma au démarrage — utiliser des migrations.
    // En développement : on utilise sync() simple (création des tables manquantes).
    //   NB : on n'utilise PAS { alter: true } car il génère un SQL invalide sur PostgreSQL
    //   pour les colonnes `unique` (erreur "syntax error at or near UNIQUE", bug Sequelize 6).
    //   Pour faire évoluer un schéma existant, passez par une migration ou recréez la base de dev.
    const isProd = process.env.NODE_ENV === 'production';
    await sequelize.sync({ force: false });
    logger.info(
      isProd
        ? 'DB connectée (mode production — schéma non altéré)'
        : 'DB synchronisée (création des tables manquantes)'
    );

    startPurgeJob();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Serveur démarré sur ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    // Résilience : graceful shutdown sur SIGTERM et SIGINT
    const shutdown = (signal) => {
      logger.info(`Signal ${signal} reçu — arrêt en cours…`);
      server.close(async () => {
        try {
          await sequelize.close();
          logger.info('Connexion DB fermée proprement');
        } catch (_err) { /* ignore */ }
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

