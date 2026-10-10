const Joi = require('joi');
const {
  pays,
  devise,
  dateISO,
  heureHHMM,
  listeQuery,
  filtres,
  largeurNeDepassePasLongueur,
} = require('../../../validations/common');
const { CODES_PAYS } = require('../../../config/pays');
const { CATEGORIES_COLIS } = require('../../../config/colis');
const {
  MODES_TRANSPORT,
  STATUTS_TOURNEE,
  EMPLACEMENTS_ANNONCE,
} = require('../../../config/reseau');

/**
 * Validations du catalogue commercial et de l'animation de l'application :
 * grille forfaitaire, emballages, tournées de collecte, annonces, modèles d'emails.
 */

const code = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9_-]{2,40}$/)
  .messages({
    'string.pattern.base': 'Code invalide (lettres, chiffres, tirets, 2 à 40 caractères)',
  });
const dimension = Joi.number().positive().max(1000).allow(null);

/* ── Grille forfaitaire ─────────────────────────────────────────────────── */

const champsArticle = {
  libelle: Joi.string().min(2).max(120),
  description: Joi.string().max(500).allow('', null),
  categorie: Joi.string().valid(...CATEGORIES_COLIS),
  modeTransport: Joi.string().valid(...MODES_TRANSPORT),
  paysDepart: pays,
  paysArrivee: pays,
  prixDakar: Joi.number().min(0).max(10000000),
  prixAutresRegions: Joi.number().min(0).max(10000000),
  devise,
  prixAPartirDe: Joi.boolean(),
  poidsMaxKg: Joi.number().positive().max(2000).allow(null),
  longueurCm: dimension,
  largeurCm: dimension,
  hauteurCm: dimension,
  ordreAffichage: Joi.number().integer().min(0).max(1000),
  isActive: Joi.boolean(),
};

const createArticleTarifSchema = Joi.object({
  ...champsArticle,
  code: code.required(),
  libelle: champsArticle.libelle.required(),
  prixDakar: champsArticle.prixDakar.required(),
  prixAutresRegions: champsArticle.prixAutresRegions.required(),
  categorie: champsArticle.categorie.default('colis_moyen'),
  modeTransport: champsArticle.modeTransport.default('maritime'),
  paysDepart: pays.default('FR'),
  paysArrivee: pays.default('SN'),
}).custom(largeurNeDepassePasLongueur);
const updateArticleTarifSchema = Joi.object({ ...champsArticle, code })
  .min(1)
  .custom(largeurNeDepassePasLongueur);

/* ── Emballages ─────────────────────────────────────────────────────────── */

const champsEmballage = {
  libelle: Joi.string().min(2).max(120),
  description: Joi.string().max(500).allow('', null),
  type: Joi.string().valid('contenant', 'prestation'),
  longueurCm: dimension,
  largeurCm: dimension,
  hauteurCm: dimension,
  capaciteKg: Joi.number().positive().max(2000).allow(null),
  prix: Joi.number().min(0).max(10000000),
  devise,
  categoriesEligibles: Joi.array()
    .items(Joi.string().valid(...CATEGORIES_COLIS))
    .min(1),
  stock: Joi.number().integer().min(0).allow(null),
  ordreAffichage: Joi.number().integer().min(0).max(1000),
  isActive: Joi.boolean(),
};

const createEmballageSchema = Joi.object({
  ...champsEmballage,
  code: code.required(),
  libelle: champsEmballage.libelle.required(),
  prix: champsEmballage.prix.required(),
}).custom(largeurNeDepassePasLongueur);
const updateEmballageSchema = Joi.object({ ...champsEmballage, code })
  .min(1)
  .custom(largeurNeDepassePasLongueur);

/* ── Tournées de collecte ───────────────────────────────────────────────── */

const champsTournee = {
  titre: Joi.string().min(3).max(150),
  pays,
  dateCollecte: dateISO,
  heureDebut: heureHHMM.allow(null),
  heureFin: heureHHMM.allow(null),
  dateLimiteInscription: dateISO.allow(null),
  villeIds: Joi.array().items(Joi.string().uuid()).max(500),
  codesPostaux: Joi.array()
    .items(Joi.string().pattern(/^\d{2,5}$/))
    .max(1000),
  capaciteMax: Joi.number().integer().min(1).allow(null),
  messageBanniere: Joi.string().max(500).allow('', null),
  afficherBanniere: Joi.boolean(),
  coursierId: Joi.string().uuid().allow(null),
  pointDepotId: Joi.string().uuid().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
};

const createTourneeSchema = Joi.object({
  ...champsTournee,
  titre: champsTournee.titre.required(),
  dateCollecte: dateISO.required(),
  pays: pays.default('FR'),
});
const updateTourneeSchema = Joi.object(champsTournee).min(1);

const changerStatutTourneeSchema = Joi.object({
  statut: Joi.string()
    .valid(...STATUTS_TOURNEE)
    .required(),
  // À l'ouverture, prévenir les clients domiciliés dans la zone
  notifierClients: Joi.boolean().default(true),
});

/* ── Annonces ───────────────────────────────────────────────────────────── */

const champsAnnonce = {
  titre: Joi.string().min(2).max(150),
  message: Joi.string().min(2).max(5000),
  emplacement: Joi.string().valid(...EMPLACEMENTS_ANNONCE),
  niveau: Joi.string().valid('info', 'succes', 'alerte'),
  lienUrl: Joi.string().uri().max(255).allow('', null),
  lienLibelle: Joi.string().max(60).allow('', null),
  dateDebut: Joi.date().iso().allow(null),
  dateFin: Joi.date().iso().allow(null),
  priorite: Joi.number().integer().min(0).max(100),
  isActive: Joi.boolean(),
};

const createAnnonceSchema = Joi.object({
  ...champsAnnonce,
  titre: champsAnnonce.titre.required(),
  message: champsAnnonce.message.required(),
});
const updateAnnonceSchema = Joi.object(champsAnnonce).min(1);

/* ── Modèles d'emails ───────────────────────────────────────────────────── */

const modeleEmailSchema = Joi.object({
  sujet: Joi.string().min(2).max(200).required(),
  corpsHtml: Joi.string().min(2).max(50000).required(),
  isActive: Joi.boolean().default(true),
});

const codeModeleParam = Joi.object({
  code: Joi.string()
    .pattern(/^[a-z_]{3,60}$/)
    .required(),
});

/** Aperçu d'un modèle d'email avant enregistrement. */
const apercuModeleSchema = Joi.object({
  sujet: Joi.string().max(200),
  corpsHtml: Joi.string().max(50000),
});

/** Retrait d'une photo d'emballage, désignée par son identifiant de stockage. */
const retirerPhotoSchema = Joi.object({ publicId: Joi.string().max(150).required() });

/* ── Filtres des listes ─────────────────────────────────────────────────── */

const listeArticlesTarifQuery = listeQuery({
  categorie: filtres.valeurs(CATEGORIES_COLIS),
  modeTransport: filtres.valeurs(MODES_TRANSPORT),
  paysDepart: filtres.valeurs(CODES_PAYS),
  paysArrivee: filtres.valeurs(CODES_PAYS),
  isActive: filtres.booleen,
});

const listeEmballagesQuery = listeQuery({
  type: filtres.valeurs(['contenant', 'prestation']),
  categorie: filtres.valeurs(CATEGORIES_COLIS),
  isActive: filtres.booleen,
});

const listeAnnoncesQuery = listeQuery({
  emplacement: filtres.valeurs(EMPLACEMENTS_ANNONCE),
  isActive: filtres.booleen,
});

const listeTourneesQuery = listeQuery({
  statut: filtres.valeurs(STATUTS_TOURNEE),
  pays: filtres.valeurs(CODES_PAYS),
  aVenir: filtres.booleen,
});

module.exports = {
  listeAnnoncesQuery,
  listeArticlesTarifQuery,
  listeEmballagesQuery,
  listeTourneesQuery,
  createArticleTarifSchema,
  updateArticleTarifSchema,
  createEmballageSchema,
  updateEmballageSchema,
  createTourneeSchema,
  updateTourneeSchema,
  changerStatutTourneeSchema,
  createAnnonceSchema,
  updateAnnonceSchema,
  modeleEmailSchema,
  codeModeleParam,
  apercuModeleSchema,
  retirerPhotoSchema,
};
