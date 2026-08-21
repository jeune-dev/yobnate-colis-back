const sequelize = require('../config/db');

/**
 * Génération des références métier.
 *
 * Chaque famille de référence s'appuie sur une séquence PostgreSQL : l'attribution
 * est atomique, ce qui exclut toute collision entre deux requêtes concurrentes,
 * contrairement à un comptage des lignes existantes.
 */

const anneeCourante = () => new Date().getFullYear();

const nomSequence = (prefixe, suffixe = '') =>
  `${prefixe}${suffixe}`.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_seq';

const prochaineValeur = async (nom, transaction = null) => {
  const options = transaction ? { transaction } : {};
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS "${nom}" START 1`, options);
  const [[{ nextval }]] = await sequelize.query(`SELECT nextval('"${nom}"') AS nextval`, options);
  return Number(nextval);
};

/** Référence annuelle au format PREFIXE-AAAA-NNNNN (facture, rotation, réclamation). */
const referenceAnnuelle = async (prefixe, { longueur = 5, transaction = null } = {}) => {
  const annee = anneeCourante();
  const valeur = await prochaineValeur(nomSequence(prefixe, `_${annee}`), transaction);
  return `${prefixe}-${annee}-${String(valeur).padStart(longueur, '0')}`;
};

/**
 * Numéro de suivi d'une expédition : deux lettres puis dix chiffres, dans l'esprit
 * des lettres de transport aériennes. Court à dicter, sûr à scanner.
 */
const genererNumeroSuivi = async (transaction = null) => {
  const valeur = await prochaineValeur('yb_suivi_seq', transaction);
  return `YB${String(valeur).padStart(10, '0')}`;
};

/** Numéro d'une pièce dans une expédition multi-colis : LTA suffixée du rang. */
const genererNumeroPiece = (numeroSuivi, ordre) =>
  `${numeroSuivi}-${String(ordre).padStart(2, '0')}`;

const genererRefColis = () => genererNumeroSuivi();
const genererRefFacture = (transaction = null) => referenceAnnuelle('FAC', { transaction });
const genererRefPaiement = (transaction = null) => referenceAnnuelle('PAY', { transaction });
const genererRefRotation = (transaction = null) =>
  referenceAnnuelle('ROT', { longueur: 4, transaction });
const genererRefEnlevement = (transaction = null) => referenceAnnuelle('ENL', { transaction });
const genererRefReclamation = (transaction = null) => referenceAnnuelle('REC', { transaction });
const genererNumeroManifeste = (transaction = null) =>
  referenceAnnuelle('MAN', { longueur: 4, transaction });
const genererNumeroFactureCommerciale = (transaction = null) =>
  referenceAnnuelle('FCO', { transaction });

/** Code à quatre chiffres remis au destinataire pour sécuriser le retrait. */
const genererCodeRetrait = () => String(require('crypto').randomInt(1000, 10000));

module.exports = {
  referenceAnnuelle,
  genererNumeroSuivi,
  genererNumeroPiece,
  genererRefColis,
  genererRefFacture,
  genererRefPaiement,
  genererRefRotation,
  genererRefEnlevement,
  genererRefReclamation,
  genererNumeroManifeste,
  genererNumeroFactureCommerciale,
  genererCodeRetrait,
};
