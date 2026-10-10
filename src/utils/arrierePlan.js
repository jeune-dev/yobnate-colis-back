const logger = require('./logger');

/**
 * File d'envois en arrière-plan, en mémoire, à concurrence bornée.
 *
 * Les envois externes (email Resend, push FCM, WhatsApp) ne doivent pas rallonger les
 * requêtes HTTP : un SMTP lent faisait durer un simple scan de colis plus de 8 s, et
 * le changement de statut d'un conteneur (un événement par colis) dépassait le délai
 * du proxy. La requête enregistre en base ce qui doit l'être, puis confie l'envoi à
 * cette file et répond aussitôt.
 *
 * - Une voie par canal (le nom passé à `lancer` : email, push, whatsapp…), chacune
 *   avec sa concurrence (ARRIERE_PLAN_CONCURRENCE, défaut 4) et sa file bornée
 *   (ARRIERE_PLAN_MAX, défaut 5000). Avec une file unique, un prestataire en panne
 *   (10 s de délai par appel) retenait tous les autres envois : 20 notifications push
 *   vers un FCM muet retardaient de 50 s le code de réinitialisation envoyé par email.
 * - Réessais facultatifs (`tentatives`), espacés (2 s, 8 s, 32 s…), pour les erreurs
 *   passagères seulement (`estTransitoire`) : un SMTP momentanément injoignable ne fait
 *   plus perdre un lien de paiement ou un code. L'attente se fait hors de la voie.
 * - `vider()` est appelé à l'arrêt du serveur pour terminer les envois en cours.
 *
 * Limite assumée : la file n'est pas durable. Un envoi en attente est perdu si le
 * processus s'arrête brutalement. Une file persistante (table de jobs, Redis/BullMQ)
 * s'impose si ces messages deviennent contractuels.
 */
const LIMITE = Number(process.env.ARRIERE_PLAN_CONCURRENCE) || 4;
const MAX_FILE = Number(process.env.ARRIERE_PLAN_MAX) || 5000;
const DELAI_REESSAI_MS = Number(process.env.ARRIERE_PLAN_DELAI_REESSAI_MS) || 2000;

const voies = new Map();
let reessaisPlanifies = 0;
let attenteVide = [];

const voie = (nom) => {
  if (!voies.has(nom)) voies.set(nom, { file: [], actifs: 0 });
  return voies.get(nom);
};

const occupation = () => {
  let actifs = 0;
  let enAttente = 0;
  for (const v of voies.values()) {
    actifs += v.actifs;
    enAttente += v.file.length;
  }
  return { actifs, enAttente, reessais: reessaisPlanifies };
};

const signalerSiVide = () => {
  const { actifs, enAttente, reessais } = occupation();
  if (actifs || enAttente || reessais) return;
  attenteVide.forEach((resoudre) => resoudre());
  attenteVide = [];
};

const journaliserEchec = (nom, err) =>
  logger.error(`Envoi en arrière-plan échoué (${nom})`, { message: err.message });

const pomper = (nom) => {
  const v = voie(nom);
  while (v.actifs < LIMITE && v.file.length) {
    const travail = v.file.shift();
    v.actifs += 1;
    Promise.resolve()
      .then(travail.tache)
      .catch((err) => {
        const { tentatives, estTransitoire, delaiMs, surEchec } = travail.options;
        if (tentatives > 1 && estTransitoire(err)) {
          // Réessai différé, sans occuper une place de la voie pendant l'attente
          reessaisPlanifies += 1;
          setTimeout(() => {
            reessaisPlanifies -= 1;
            lancer(nom, travail.tache, {
              ...travail.options,
              tentatives: tentatives - 1,
              delaiMs: delaiMs * 4,
            });
            signalerSiVide();
          }, delaiMs).unref();
          return;
        }
        (surEchec || ((e) => journaliserEchec(nom, e)))(err);
      })
      .finally(() => {
        v.actifs -= 1;
        pomper(nom);
        signalerSiVide();
      });
  }
};

/**
 * Confie une tâche asynchrone à la voie `nom` ; ne lève jamais d'exception.
 * Options : `tentatives` (1), `estTransitoire(err)` (toujours vrai), `surEchec(err)`
 * (journalisation par défaut), appelé quand la dernière tentative échoue.
 */
const lancer = (nom, tache, options = {}) => {
  const v = voie(nom);
  if (v.file.length >= MAX_FILE) {
    logger.warn('File d’arrière-plan pleine : envoi abandonné', { nom, enAttente: v.file.length });
    return;
  }
  v.file.push({
    tache,
    options: {
      tentatives: 1,
      estTransitoire: () => true,
      delaiMs: DELAI_REESSAI_MS,
      ...options,
    },
  });
  pomper(nom);
};

/** Attend la fin des envois en cours, en attente et des réessais (au plus `delaiMs`). */
const vider = (delaiMs = 10000) =>
  new Promise((resoudre) => {
    const { actifs, enAttente, reessais } = occupation();
    if (!actifs && !enAttente && !reessais) return resoudre(true);
    const minuteur = setTimeout(() => resoudre(false), delaiMs);
    attenteVide.push(() => {
      clearTimeout(minuteur);
      resoudre(true);
    });
  });

const etat = () => occupation();

module.exports = { lancer, vider, etat };
