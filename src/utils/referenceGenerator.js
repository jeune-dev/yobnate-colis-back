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

/**
 * Séquences dont l'existence est déjà vérifiée par ce processus : le CREATE SEQUENCE
 * (une instruction DDL, qui verrouille le catalogue) n'est plus rejoué à chaque
 * référence générée, mais une fois par séquence et par processus.
 */
const sequencesConnues = new Set();

const creerSequence = async (nom) => {
  if (sequencesConnues.has(nom)) return;
  try {
    // Hors de la transaction appelante : idempotent, et une collision entre deux
    // créations simultanées ne doit pas annuler la transaction métier
    await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS "${nom}" START 1`);
  } catch (err) {
    // 23505 / 42P07 : créée au même instant par une autre connexion
    if (!['23505', '42P07'].includes(err.parent?.code)) throw err;
  }
  sequencesConnues.add(nom);
};

const prochaineValeur = async (nom, transaction = null) => {
  await creerSequence(nom);
  const options = transaction ? { transaction } : {};
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

/**
 * Initiales du client reprises dans le numéro de suivi : la première lettre de
 * chaque mot du nom complet, complétée par les lettres suivantes du dernier mot
 * pour atteindre trois caractères (« Papa Moussa Ndiaye » → PMN, « Awa Diop » → ADI).
 */
const initialesClient = (nomComplet) => {
  const mots = String(nomComplet || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!mots.length) return 'XXX';

  let initiales = mots.map((m) => m[0]).join('');
  const dernier = mots[mots.length - 1];
  for (let i = 1; initiales.length < 3 && i < dernier.length; i += 1) initiales += dernier[i];
  return initiales.padEnd(3, 'X').slice(0, 3);
};

/**
 * Numéro de suivi au format Yobnate, par exemple PNCO0126032026MDT03 :
 *
 *   PN        préfixe de l'entreprise (paramétrable)
 *   CO01      conteneur n° 01
 *   26032026  date du jour (JJMMAAAA)
 *   MDT       initiales du client
 *   03        catégorie du colis
 *
 * Deux demandes identiques le même jour (même client, même catégorie, même
 * conteneur) reçoivent un suffixe alphabétique (…MDT03B, …MDT03C) afin que le
 * numéro reste unique et non réattribuable.
 */
const genererNumeroSuiviYobnate = async ({
  prefixe = 'PN',
  codeConteneur = 'CO',
  numeroConteneur = 0,
  date = new Date(),
  nomClient = '',
  categorie = 2,
  transaction = null,
}) => {
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const base =
    `${prefixe}${codeConteneur}${String(numeroConteneur).padStart(2, '0')}` +
    `${jj}${mm}${date.getFullYear()}${initialesClient(nomClient)}${String(categorie).padStart(2, '0')}`;

  const options = { replacements: { motif: `${base}%` } };
  if (transaction) options.transaction = transaction;
  const [[{ total }]] = await sequelize.query(
    'SELECT COUNT(*)::int AS total FROM colis WHERE reference LIKE :motif',
    options
  );
  if (!total) return base;

  // 1 existant → B, 2 → C… au-delà de Z, un suffixe numérique prend le relais
  const rang = Number(total);
  return rang < 26 ? `${base}${String.fromCharCode(65 + rang)}` : `${base}${rang + 1}`;
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
const genererRefTournee = (transaction = null) =>
  referenceAnnuelle('TRN', { longueur: 4, transaction });
const genererNumeroManifeste = (transaction = null) =>
  referenceAnnuelle('MAN', { longueur: 4, transaction });
const genererNumeroFactureCommerciale = (transaction = null) =>
  referenceAnnuelle('FCO', { transaction });

/** Code de parrainage lisible : 8 caractères sans ambiguïté (ni 0/O ni 1/I). */
const genererCodeParrainage = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = require('crypto').randomBytes(8);
  return Array.from(octets, (o) => alphabet[o % alphabet.length]).join('');
};

/** Code à quatre chiffres remis au destinataire pour sécuriser le retrait. */
const genererCodeRetrait = () => String(require('crypto').randomInt(1000, 10000));

module.exports = {
  referenceAnnuelle,
  genererNumeroSuivi,
  genererNumeroSuiviYobnate,
  initialesClient,
  genererNumeroPiece,
  genererRefColis,
  genererRefFacture,
  genererRefPaiement,
  genererRefRotation,
  genererRefEnlevement,
  genererRefReclamation,
  genererRefTournee,
  genererCodeParrainage,
  genererNumeroManifeste,
  genererNumeroFactureCommerciale,
  genererCodeRetrait,
};
