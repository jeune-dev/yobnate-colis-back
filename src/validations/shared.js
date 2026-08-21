const Joi = require('joi');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

// Seuls la France et le Sénégal sont couverts par le service pour le moment
const PAYS_TELEPHONE_AUTORISES = ['FR', 'SN'];

const phone = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const numero = parsePhoneNumberFromString(value);
    if (!numero || !numero.isValid() || !PAYS_TELEPHONE_AUTORISES.includes(numero.country)) {
      return helpers.error('any.invalid');
    }
    return numero.number; // normalisé au format E.164 (ex: +221771234567)
  })
  .messages({
    'any.invalid':
      'Numéro de téléphone invalide (format international, France ou Sénégal uniquement)',
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

const paginationQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(true);

module.exports = {
  phone,
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
  paginationQuery,
};
