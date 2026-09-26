/**
 * État du processus partagé entre server.js et les sondes de santé : pendant
 * l'arrêt gracieux, /health répond 503 pour que le proxy et Docker cessent
 * d'envoyer du trafic avant la fermeture des connexions.
 */
let enArret = false;

module.exports = {
  signalerArret: () => {
    enArret = true;
  },
  estEnArret: () => enArret,
  /** Annule l'état d'arrêt (tests uniquement : un processus arrêté ne redémarre pas). */
  reprendre: () => {
    enArret = false;
  },
};
