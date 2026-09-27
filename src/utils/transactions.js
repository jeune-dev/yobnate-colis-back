const logger = require('./logger');

/**
 * Effets de bord d'une transaction (notifications, journal, envois) : ils ne doivent
 * partir qu'une fois la transaction VALIDÉE, et sans tenir sa connexion.
 *
 * Lancés depuis l'intérieur de la transaction, ils avaient deux défauts :
 * - chaque requête SQL d'une notification prenait une SECONDE connexion au pool
 *   pendant que la transaction gardait la sienne (et ses verrous). Avec un pool de
 *   10, dix annulations simultanées suffisaient à bloquer toute l'API 30 s
 *   (acquisition impossible, puis 503) ;
 * - une notification ou un email partait même si la transaction était ensuite
 *   annulée (événement « fantôme » annoncé au client).
 *
 * `apresCommit(t, fn)` exécute `fn` après le COMMIT de la transaction racine (la
 * connexion est déjà rendue au pool à ce moment) et jamais en cas d'annulation ;
 * sans transaction, `fn` s'exécute immédiatement. Les erreurs de `fn` sont
 * journalisées, jamais propagées : le COMMIT a réussi, l'appelant ne doit pas
 * recevoir d'erreur pour un envoi secondaire.
 */

/** Transaction de plus haut niveau (un point de sauvegarde a un parent). */
const racine = (transaction) => {
  let t = transaction;
  while (t?.parent) t = t.parent;
  return t;
};

const apresCommit = (transaction, fn, contexte = {}) => {
  const executer = async () => {
    try {
      return await fn();
    } catch (err) {
      logger.error('Traitement après validation en échec', { message: err.message, ...contexte });
      return undefined;
    }
  };
  const t = racine(transaction);
  if (!t) return executer();
  // Limite connue de Sequelize 6 : ses crochets s'exécutent aussi si l'instruction
  // COMMIT elle-même échoue (perte de connexion à cet instant précis), cas rarissime.
  t.afterCommit(executer);
  return Promise.resolve(undefined);
};

module.exports = { apresCommit, racine };
