const Joi = require('joi');
const { phone, devise, heureHHMM, dateISO } = require('./shared');
const {
  TYPES_CONTENU,
  MODES_DEPOT,
  MODES_LIVRAISON,
  INCOTERMS,
  PAYEURS,
  STATUTS_COLIS,
  CODES_EVENEMENTS,
  TYPES_EMBALLAGE,
  CATEGORIES_COLIS,
  ETATS_MARCHANDISE,
} = require('../constants/colis');
const { CRENEAUX_ENLEVEMENT } = require('../constants/reseau');

const uuid = Joi.string().uuid();

const pieceSchema = Joi.object({
  designation: Joi.string().max(255).allow('', null),
  typeEmballage: Joi.string()
    .valid(...TYPES_EMBALLAGE)
    .default('carton'),
  poidsKg: Joi.number().positive().max(1000).required(),
  longueurCm: Joi.number().positive().max(500).allow(null),
  largeurCm: Joi.number().positive().max(500).allow(null),
  hauteurCm: Joi.number().positive().max(500).allow(null),
});

const articleDouaneSchema = Joi.object({
  designation: Joi.string().min(2).max(255).required(),
  codeSh: Joi.string()
    .pattern(/^\d{6,10}$/)
    .allow('', null),
  quantite: Joi.number().positive().default(1),
  unite: Joi.string().valid('piece', 'kg', 'litre', 'metre', 'paire', 'lot').default('piece'),
  valeurUnitaire: Joi.number().min(0).required(),
  poidsNetKg: Joi.number().min(0).allow(null),
  paysOrigine: Joi.string().length(2).uppercase().allow('', null),
  tauxDroits: Joi.number().min(0).max(100).allow(null),
  marque: Joi.string().max(80).allow('', null),
  etat: Joi.string()
    .valid(...ETATS_MARCHANDISE)
    .allow(null),
});

const categorieSchema = Joi.string()
  .valid(...CATEGORIES_COLIS)
  .default('colis_moyen');

/** Article choisi dans la grille forfaitaire (valise, barigot, télévision…). */
const ligneArticleSchema = Joi.object({
  articleTarifId: uuid.required(),
  quantite: Joi.number().integer().min(1).max(50).default(1),
});

/** Emballage acheté (barigot, carton) ou prestation d'emballage. */
const ligneEmballageSchema = Joi.object({
  emballageId: uuid.required(),
  quantite: Joi.number().integer().min(1).max(20).default(1),
});

/** Informations de collecte à domicile : date, heure, logement, emballage. */
const infosCollecteSchema = Joi.object({
  dateSouhaitee: dateISO.allow(null),
  heureSouhaitee: heureHHMM.allow(null),
  creneau: Joi.string()
    .valid(...CRENEAUX_ENLEVEMENT)
    .allow(null),
  etage: Joi.number().integer().min(-5).max(60).allow(null),
  ascenseur: Joi.boolean().allow(null),
  emballageRequis: Joi.boolean().default(false),
  instructions: Joi.string().max(500).allow('', null),
}).default({});

/** Adresse sénégalaise détaillée, exigée pour les catégories 2 et 3 (contrôle au service). */
const adresseSenegal = {
  destinataireQuartier: Joi.string().max(100).allow('', null),
  destinataireArrondissement: Joi.string().max(100).allow('', null),
  destinataireDepartement: Joi.string().max(100).allow('', null),
  destinatairePointRepere: Joi.string().max(255).allow('', null),
};

/** Sans détail des colis ni article de la grille, le poids doit être indiqué. */
const exigerPoidsOuArticles = (value, helpers) => {
  const sansPoids = !value.pieces?.length && !value.poidsKg;
  const sansArticle = !value.articles?.length;
  if (sansPoids && sansArticle && value.categorie !== 'documents') {
    return helpers.message(
      'Indiquez le poids de votre colis ou choisissez un article de la grille'
    );
  }
  return value;
};

/** Le devis et la déclaration partagent la même base de champs de simulation. */
const baseSimulation = {
  villeDepartId: uuid.required(),
  villeArriveeId: uuid.required(),
  categorie: categorieSchema,
  articles: Joi.array().items(ligneArticleSchema).max(30),
  emballages: Joi.array().items(ligneEmballageSchema).max(10),
  optionColissimo: Joi.boolean().default(false),
  typeContenu: Joi.string()
    .valid(...TYPES_CONTENU)
    .default('marchandise'),
  pieces: Joi.array().items(pieceSchema).min(1).max(20),
  poidsKg: Joi.number()
    .positive()
    .max(1000)
    .when('pieces', { is: Joi.exist(), then: Joi.forbidden() }),
  valeurDeclaree: Joi.number().min(0).max(50000000).default(0),
  deviseValeur: devise,
  assuranceSouscrite: Joi.boolean().default(false),
  modeDepot: Joi.string()
    .valid(...MODES_DEPOT)
    .default('point_collecte'),
  modeLivraison: Joi.string()
    .valid(...MODES_LIVRAISON)
    .default('point_retrait'),
  incoterm: Joi.string()
    .valid(...INCOTERMS)
    .default('DAP'),
  payeur: Joi.string()
    .valid(...PAYEURS)
    .default('expediteur'),
  fragile: Joi.boolean().default(false),
  marchandiseDangereuse: Joi.boolean().default(false),
};

const devisSchema = Joi.object({ ...baseSimulation, serviceId: uuid }).custom(
  exigerPoidsOuArticles
);

const declarerColisSchema = Joi.object({
  serviceId: uuid.required(),
  referenceClient: Joi.string().max(50).allow('', null),

  categorie: categorieSchema,
  typeDocument: Joi.string()
    .max(100)
    .when('categorie', { is: 'documents', then: Joi.required(), otherwise: Joi.allow('', null) })
    .messages({ 'any.required': 'Précisez le type de document envoyé' }),
  etatMarchandise: Joi.string()
    .valid(...ETATS_MARCHANDISE)
    .when('categorie', { is: 'colis_moyen', then: Joi.required(), otherwise: Joi.allow(null) })
    .messages({ 'any.required': "Précisez l'état de la marchandise (neuf ou occasion)" }),
  articles: Joi.array().items(ligneArticleSchema).max(30),
  emballages: Joi.array().items(ligneEmballageSchema).max(10),
  optionColissimo: Joi.boolean().default(false),
  tourneeCollecteId: uuid.allow(null),
  infosCollecte: infosCollecteSchema,
  conditionsAcceptees: Joi.boolean().valid(true).required().messages({
    'any.only': 'Vous devez accepter les conditions générales',
    'any.required': 'Vous devez accepter les conditions générales',
  }),

  typeContenu: Joi.string()
    .valid(...TYPES_CONTENU)
    .default('marchandise'),
  description: Joi.string().max(500).allow('', null),
  fragile: Joi.boolean().default(false),
  marchandiseDangereuse: Joi.boolean().default(false),

  expediteurNom: Joi.string().min(2).max(120).required(),
  expediteurEntreprise: Joi.string().max(120).allow('', null),
  expediteurTelephone: phone.required(),
  expediteurEmail: Joi.string().email().max(150).allow('', null),
  villeDepartId: uuid.required(),
  adresseDepart: Joi.string().max(255).allow('', null),
  codePostalDepart: Joi.string().max(10).allow('', null),

  destinataireNom: Joi.string().min(2).max(120).required(),
  destinataireEntreprise: Joi.string().max(120).allow('', null),
  destinataireTelephone: phone.required(),
  destinataireEmail: Joi.string().email().max(150).allow('', null),
  villeArriveeId: uuid.required(),
  adresseLivraison: Joi.string().max(255).allow('', null),
  codePostalArrivee: Joi.string().max(10).allow('', null),
  instructionsLivraison: Joi.string().max(500).allow('', null),
  ...adresseSenegal,

  modeDepot: Joi.string()
    .valid(...MODES_DEPOT)
    .default('point_collecte'),
  pointCollecteDepartId: uuid.when('modeDepot', { is: 'point_collecte', then: Joi.required() }),
  modeLivraison: Joi.string()
    .valid(...MODES_LIVRAISON)
    .default('point_retrait'),
  pointRetraitId: uuid.when('modeLivraison', { is: 'point_retrait', then: Joi.required() }),

  pieces: Joi.array().items(pieceSchema).min(1).max(20),
  poidsKg: Joi.number()
    .positive()
    .max(1000)
    .when('pieces', { is: Joi.exist(), then: Joi.forbidden() }),
  typeEmballage: Joi.string()
    .valid(...TYPES_EMBALLAGE)
    .default('carton'),

  valeurDeclaree: Joi.number()
    .min(0)
    .max(50000000)
    .when('categorie', {
      is: 'colis_moyen',
      then: Joi.number().positive().required(),
      otherwise: Joi.number().default(0),
    })
    .messages({ 'any.required': 'Indiquez la valeur estimée du contenu' }),
  deviseValeur: devise,
  assuranceSouscrite: Joi.boolean().default(false),

  incoterm: Joi.string()
    .valid(...INCOTERMS)
    .default('DAP'),
  payeur: Joi.string()
    .valid(...PAYEURS)
    .default('expediteur'),

  numeroEori: Joi.string().max(20).allow('', null),
  numeroNinea: Joi.string().max(20).allow('', null),
  articlesDouane: Joi.array().items(articleDouaneSchema).max(50),
})
  .custom(exigerPoidsOuArticles)
  .custom((value, helpers) =>
    value.categorie === 'colis_xxl' && !value.description
      ? helpers.message('Décrivez le contenu de votre colis XXL')
      : value
  );

const updateColisSchema = Joi.object({
  description: Joi.string().max(500).allow('', null),
  destinataireNom: Joi.string().min(2).max(120),
  destinataireTelephone: phone,
  destinataireEmail: Joi.string().email().max(150).allow('', null),
  adresseLivraison: Joi.string().max(255).allow('', null),
  instructionsLivraison: Joi.string().max(500).allow('', null),
  ...adresseSenegal,
  notesInternes: Joi.string().max(1000).allow('', null),
}).min(1);

/** Corrections autorisées au client avant l'arrivée au Sénégal. */
const modifierColisClientSchema = Joi.object({
  description: Joi.string().max(500).allow('', null),
  destinataireNom: Joi.string().min(2).max(120),
  destinataireTelephone: phone,
  destinataireEmail: Joi.string().email().max(150).allow('', null),
  adresseLivraison: Joi.string().max(255).allow('', null),
  codePostalArrivee: Joi.string().max(10).allow('', null),
  instructionsLivraison: Joi.string().max(500).allow('', null),
  ...adresseSenegal,
}).min(1);

const repondrePropositionSchema = Joi.object({
  motif: Joi.string().max(500).allow('', null),
});

/** Validation d'une demande (catégorie 2), avec ajustement éventuel d'un prix « à partir de ». */
const validerDemandeSchema = Joi.object({
  montantTotal: Joi.number().positive().max(100000000),
  commentaire: Joi.string().max(1000).allow('', null),
  datePrevueEnlevement: dateISO.allow(null),
});

const refuserDemandeSchema = Joi.object({
  motif: Joi.string().min(3).max(500).required(),
});

/** Proposition tarifaire d'un colis XXL (montant TTC dans la devise de facturation). */
const proposerTarifSchema = Joi.object({
  montantTotal: Joi.number().positive().max(100000000).required(),
  commentaire: Joi.string().max(1000).allow('', null),
  validiteJours: Joi.number().integer().min(1).max(60),
  datePrevueEnlevement: dateISO.allow(null),
});

const corrigerPeseeSchema = Joi.object({
  poidsVerifieKg: Joi.number().positive().max(1000),
  pieces: Joi.array().items(pieceSchema).min(1).max(20),
  motif: Joi.string().max(255).allow('', null),
}).or('poidsVerifieKg', 'pieces');

const enregistrerEvenementSchema = Joi.object({
  codeEvenement: Joi.string()
    .valid(...CODES_EVENEMENTS)
    .required(),
  statut: Joi.string().valid(...STATUTS_COLIS),
  lieu: Joi.string().max(150).allow('', null),
  pays: Joi.string().valid('FR', 'SN').allow(null),
  pointCollecteId: Joi.string().uuid().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
  motif: Joi.string().max(255).allow('', null),
  codeRetrait: Joi.string().max(10).allow('', null),
  visiblePublic: Joi.boolean().default(true),
});

const enregistrerEvenementLotSchema = Joi.object({
  colisIds: Joi.array().items(Joi.string().uuid()).min(1).max(200).required(),
}).concat(enregistrerEvenementSchema);

const changerPointRetraitSchema = Joi.object({
  pointRetraitId: Joi.string().uuid().required(),
  motif: Joi.string().max(255).allow('', null),
});

const affecterCoursierSchema = Joi.object({
  coursierId: Joi.string().uuid().required(),
  mission: Joi.string().valid('enlevement', 'livraison').required(),
});

const noteInterneSchema = Joi.object({
  note: Joi.string().min(2).max(1000).required(),
});

const annulerColisSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

const abonnerSuiviSchema = Joi.object({
  canal: Joi.string().valid('email', 'sms').default('email'),
  destination: Joi.string().max(150).required(),
  profil: Joi.string().valid('expediteur', 'destinataire', 'tiers').default('destinataire'),
});

module.exports = {
  modifierColisClientSchema,
  repondrePropositionSchema,
  validerDemandeSchema,
  refuserDemandeSchema,
  proposerTarifSchema,
  infosCollecteSchema,
  devisSchema,
  declarerColisSchema,
  updateColisSchema,
  corrigerPeseeSchema,
  enregistrerEvenementSchema,
  enregistrerEvenementLotSchema,
  changerPointRetraitSchema,
  affecterCoursierSchema,
  noteInterneSchema,
  annulerColisSchema,
  abonnerSuiviSchema,
  pieceSchema,
  articleDouaneSchema,
};
