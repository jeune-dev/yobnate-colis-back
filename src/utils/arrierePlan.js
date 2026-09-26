const logger = require('./logger');

/**
 * File d'envois en arrière-plan, en mémoire, à concurrence bornée.
 *
 * Les envois externes (email SMTP, push FCM, WhatsApp) ne doivent pas rallonger les
 * requêtes HTTP : un SMTP lent faisait durer un simple scan de colis plus de 8 s, et
 * le changement de statut d'un conteneur (un événement par colis) dépassait le délai
 * du proxy. La requête enregistre en base ce qui doit l'être, puis confie l'envoi à
 * cette file et répond aussitôt.
 *
 * - Concurrence bornée (ARRIERE_PLAN_CONCURRENCE, défaut 4) : jamais d'avalanche de
 *   connexions SMTP ni de requêtes HTTP sortantes.
 * - File bornée (ARRIERE_PLAN_MAX, défaut 5000) : au-delà, l'envoi est abandonné et
 *   journalisé plutôt que de faire gonfler la mémoire.
 * - `vider()` est appelé à l'arrêt du serveur pour terminer les envois en cours.
 *
 * Limite assumée : la file n'est pas durable. Un envoi en attente est perdu si le
 * processus s'arrête brutalement (comme il l'était déjà quand l'envoi se faisait
 * dans la requête). Une file persistante (Redis/BullMQ, table de jobs) s'impose si
 * ces messages deviennent contractuels.
 */
const LIMITE = Number(process.env.ARRIERE_PLAN_CONCURRENCE) || 4;
const MAX_FILE = Number(process.env.ARRIERE_PLAN_MAX) || 5000;

const file = [];
let actifs = 0;
let attenteVide = [];

const signalerSiVide = () => {
  if (actifs || file.length) return;
  attenteVide.forEach((resoudre) => resoudre());
  attenteVide = [];
};

const pomper = () => {
  while (actifs < LIMITE && file.length) {
    const { nom, tache } = file.shift();
    actifs += 1;
    Promise.resolve()
      .then(tache)
      .catch((err) =>
        logger.error(`Envoi en arrière-plan échoué (${nom})`, { message: err.message })
      )
      .finally(() => {
        actifs -= 1;
        pomper();
        signalerSiVide();
      });
  }
};

/** Confie une tâche asynchrone à la file ; ne lève jamais d'exception. */
const lancer = (nom, tache) => {
  if (file.length >= MAX_FILE) {
    logger.warn('File d’arrière-plan pleine : envoi abandonné', { nom, enAttente: file.length });
    return;
  }
  file.push({ nom, tache });
  pomper();
};

/** Attend la fin des envois en cours et en attente (au plus `delaiMs`). */
const vider = (delaiMs = 10000) =>
  new Promise((resoudre) => {
    if (!actifs && !file.length) return resoudre(true);
    const minuteur = setTimeout(() => resoudre(false), delaiMs);
    attenteVide.push(() => {
      clearTimeout(minuteur);
      resoudre(true);
    });
  });

const etat = () => ({ actifs, enAttente: file.length });

module.exports = { lancer, vider, etat };
