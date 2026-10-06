const Joi = require('joi');
const { validerTelephone, validerEmail } = require('../utils/validationIdentifiants');

/**
 * Téléphone France ou Sénégal, normalisé au format E.164 (ex : +221771234567).
 * Sans indicatif, le numéro est rattaché au champ `pays` voisin (Sénégal à défaut).
 * Le refus nomme le problème : indicatif, nombre de chiffres ou plage non attribuée.
 */
const phone = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const paysParDefaut = helpers.state.ancestors?.[0]?.pays;
    const resultat = validerTelephone(value, { paysParDefaut });
    return resultat.valide ? resultat.valeur : helpers.message(resultat.raison);
  });

/** Adresse email, contrôlée règle par règle et enregistrée en minuscules. */
const email = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const resultat = validerEmail(value);
    return resultat.valide ? resultat.valeur : helpers.message(resultat.raison);
  });

/**
 * Nom ou prénom d'une personne (la mise en forme — NOM en capitales, Prénom —
 * est appliquée à l'enregistrement par le modèle User).
 */
const nomPersonne = (libelle) =>
  Joi.string()
    .trim()
    .min(2)
    .max(50)
    .messages({
      'string.empty': `Indiquez votre ${libelle}`,
      'any.required': `Indiquez votre ${libelle}`,
      'string.min': `Votre ${libelle} doit comporter au moins 2 caractères`,
      'string.max': `Votre ${libelle} ne peut pas dépasser 50 caractères`,
    });

const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
  .messages({
    'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
    'string.max': 'Le mot de passe ne peut pas dépasser 72 caractères',
    'string.pattern.base':
      'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial',
  });

const pays = Joi.string()
  .valid('FR', 'SN')
  .messages({ 'any.only': 'Pays non desservi (France ou Sénégal uniquement)' });

const devise = Joi.string().valid('EUR', 'XOF');

const latitude = Joi.number().min(-90).max(90);
const longitude = Joi.number().min(-180).max(180);

const heureHHMM = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .messages({
    'string.pattern.base': 'Heure invalide, format attendu HH:MM',
  });

const dateISO = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .messages({
    'string.pattern.base': 'Date invalide, format attendu AAAA-MM-JJ',
  });

// Schémas de validation des paramètres de route
const uuidParam = Joi.object({
  id: Joi.string().uuid().required().messages({ 'string.guid': 'Identifiant invalide' }),
});
const factureIdParam = Joi.object({
  factureId: Joi.string()
    .uuid()
    .required()
    .messages({ 'string.guid': 'Identifiant de facture invalide' }),
});
const colisIdParam = Joi.object({
  colisId: Joi.string()
    .uuid()
    .required()
    .messages({ 'string.guid': 'Identifiant de colis invalide' }),
});
const referenceParam = Joi.object({ reference: Joi.string().trim().min(3).max(40).required() });
/** Route imbriquée `/:id/articles/:articleId` : les deux identifiants sont validés et conservés. */
const articleParam = Joi.object({
  id: Joi.string().uuid().required().messages({ 'string.guid': 'Identifiant invalide' }),
  articleId: Joi.string()
    .uuid()
    .required()
    .messages({ 'string.guid': "Identifiant d'article invalide" }),
});

/** Activation / désactivation d'une ressource : l'état cible est explicite. */
const statutActifSchema = Joi.object({ isActive: Joi.boolean().required() });

const paginationQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(true);

/**
 * Filtres d'une liste (paramètres d'URL) : seuls les champs déclarés sont contrôlés,
 * les autres (tri, options propres à un écran) passent tels quels. Une valeur vide
 * (`?statut=`) reste acceptée : le service l'ignore, comme avant. `limit` n'a pas de
 * plafond ici : utils/paginate le ramène à 100, sans refuser la requête.
 */
const listeQuery = (champs) =>
  Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1),
    ...champs,
  })
    .fork([...Object.keys(champs), 'page', 'limit'], (schema) => schema.allow(''))
    .unknown(true);

/** Briques des filtres : identifiant, booléen « true/false », recherche, période, tri. */
const filtres = {
  id: Joi.string().uuid().messages({ 'string.guid': 'Identifiant invalide' }),
  booleen: Joi.boolean(),
  recherche: Joi.string().trim().max(100),
  valeurs: (liste) => Joi.string().valid(...liste),
  // Horodatage (createdAt) : date seule ou date-heure ISO 8601
  date: Joi.string().isoDate().messages({ 'string.isoDate': 'Date invalide (format ISO 8601)' }),
  sortOrder: Joi.string().lowercase().valid('asc', 'desc'),
};

module.exports = {
  phone,
  email,
  nomPersonne,
  password,
  pays,
  devise,
  latitude,
  longitude,
  heureHHMM,
  dateISO,
  uuidParam,
  factureIdParam,
  colisIdParam,
  referenceParam,
  articleParam,
  statutActifSchema,
  paginationQuery,
  listeQuery,
  filtres,
};
