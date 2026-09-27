const bcrypt = require('bcrypt');
const { bcryptConfig } = require('../config/security');

/**
 * Hachage et vérification des mots de passe, à concurrence bornée.
 *
 * Un calcul bcrypt (coût 12) consomme ~250 ms de CPU. Il s'exécute hors de la
 * boucle d'événements, mais sur les cœurs que le processus partage avec elle :
 * mesuré sur 4 cœurs, 40 connexions simultanées occupaient toute la machine et une
 * simple lecture publique passait de 1 500 à 4 requêtes/s (p50 de 5 ms à 2,4 s).
 * Dans le conteneur de production limité à 1 vCPU, quelques connexions par seconde
 * suffisaient à figer toute l'API.
 *
 * Au plus BCRYPT_CONCURRENCE calculs à la fois (2 par défaut) : les connexions
 * au-delà attendent leur tour, les autres requêtes gardent du CPU.
 */
const MAX_SIMULTANES = Number(process.env.BCRYPT_CONCURRENCE) || 2;
let enCours = 0;
const file = [];

const avecPlace = async (calcul) => {
  if (enCours >= MAX_SIMULTANES) await new Promise((resoudre) => file.push(resoudre));
  enCours += 1;
  try {
    return await calcul();
  } finally {
    enCours -= 1;
    const suivant = file.shift();
    if (suivant) suivant();
  }
};

const hacher = (motDePasse) =>
  avecPlace(() => bcrypt.hash(String(motDePasse), bcryptConfig.saltRounds));

const comparer = (motDePasse, empreinte) =>
  avecPlace(() => bcrypt.compare(String(motDePasse), empreinte));

module.exports = { hacher, comparer, etat: () => ({ enCours, enAttente: file.length }) };
