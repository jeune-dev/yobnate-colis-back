const cron = require('node-cron');
const logger = require('../utils/logger');
const { cleanupExpiredTokens } = require('./cleanupExpiredTokens.job');

/**
 * Tâches planifiées (node-cron, comme Sign et Widjila).
 *
 * En cluster PM2, chaque worker exécuterait sinon la même tâche au même
 * instant : seule l'instance 0 (ou un processus seul, en conteneur) planifie.
 */
const estLeader = () => !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

const JOBS = [
  { nom: 'purge des jetons expirés', planning: '17 * * * *', executer: cleanupExpiredTokens },
];

/** Exécute une tâche en journalisant son échec sans jamais faire tomber le processus. */
const executer = async ({ nom, executer: tache }) => {
  try {
    await tache();
  } catch (err) {
    logger.error(`Tâche planifiée en échec : ${nom}`, { message: err.message, stack: err.stack });
  }
};

const demarrerJobs = () => {
  if (!estLeader()) return [];
  return JOBS.map((job) => {
    executer(job); // une passe au démarrage
    return cron.schedule(job.planning, () => executer(job));
  });
};

const arreterJobs = (taches) => taches.forEach((t) => t.stop());

module.exports = { demarrerJobs, arreterJobs, JOBS, estLeader };
