const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Client Redis partagé, facultatif.
 *
 * Il sert de store commun aux limiteurs de débit : en cluster PM2, un store en
 * mémoire compte PAR PROCESSUS et divise d'autant la protection anti force
 * brute. Sans REDIS_URL (développement, tests, conteneur unique), l'application
 * fonctionne à l'identique avec le store mémoire.
 */
const url = process.env.REDIS_URL;

let client = null;
if (url) {
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.warn('Redis indisponible', { message: err.message }));
  client.on('ready', () => logger.info('Redis connecté'));
}

module.exports = client;
