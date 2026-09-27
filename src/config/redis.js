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
    // La file hors ligne est NECESSAIRE ici : les limiteurs de debit
    // construisent leur store au chargement des modules, donc avant que la
    // poignee de main TCP avec Redis n'ait abouti. Avec `false`, ce premier
    // `SCRIPT LOAD` echouait systematiquement sur « Stream isn't writeable »,
    // et le rejet non capture tuait le processus au demarrage — l'application
    // ne pouvait jamais demarrer des que REDIS_URL etait renseignee.
    // `maxRetriesPerRequest: 1` garde le garde-fou recherche : si Redis est
    // reellement absent, les commandes en file echouent vite au lieu de
    // s'accumuler indefiniment.
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.warn('Redis indisponible', { message: err.message }));
  client.on('ready', () => logger.info('Redis connecté'));
}

module.exports = client;
