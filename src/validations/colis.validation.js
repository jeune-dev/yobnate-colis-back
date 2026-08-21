const Joi = require('joi');
const { phone, devise } = require('./shared');
const {
  TYPES_CONTENU,
  MODES_DEPOT,
  MODES_LIVRAISON,
  INCOTERMS,
  PAYEURS,
  STATUTS_COLIS,
  CODES_EVENEMENTS,
  TYPES_EMBALLAGE,
} = require('../constants/colis');

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
});

/** Le devis et la déclaration partagent la même base de champs de simulation. */
const baseSimulation = {
  villeDepartId: uuid.required(),
  villeArriveeId: uuid.required(),
  typeContenu: Joi.string()
    .valid(...TYPES_CONTENU)
    .default('marchandise'),
  pieces: Joi.array().items(pieceSchema).min(1).max(20),
  poidsKg: Joi.number()
    .positive()
    .max(1000)
    .when('pieces', { is: Joi.exist(), then: Joi.forbidden(), otherwise: Joi.required() }),
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

const devisSchema = Joi.object({ ...baseSimulation, serviceId: uuid });

const declarerColisSchema = Joi.object({
  serviceId: uuid.required(),
  referenceClient: Joi.string().max(50).allow('', null),

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
    .when('pieces', { is: Joi.exist(), then: Joi.forbidden(), otherwise: Joi.required() }),
  typeEmballage: Joi.string()
    .valid(...TYPES_EMBALLAGE)
    .default('carton'),

  valeurDeclaree: Joi.number().min(0).max(50000000).default(0),
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
});

const updateColisSchema = Joi.object({
  description: Joi.string().max(500).allow('', null),
  destinataireNom: Joi.string().min(2).max(120),
  destinataireTelephone: phone,
  destinataireEmail: Joi.string().email().max(150).allow('', null),
  adresseLivraison: Joi.string().max(255).allow('', null),
  instructionsLivraison: Joi.string().max(500).allow('', null),
  notesInternes: Joi.string().max(1000).allow('', null),
}).min(1);

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
