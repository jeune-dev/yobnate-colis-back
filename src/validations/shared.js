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
  .messages({ 'any.invalid': 'Numéro de téléphone invalide (format international, France ou Sénégal uniquement)' });

const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/)
  .messages({
    'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
    'string.max': 'Le mot de passe ne peut pas dépasser 72 caractères',
    'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial'
  });

// Schémas de validation des paramètres de route
const uuidParam = Joi.object({ id: Joi.string().uuid().required().messages({ 'string.guid': 'Identifiant invalide' }) });
const factureIdParam = Joi.object({ factureId: Joi.string().uuid().required().messages({ 'string.guid': 'Identifiant de facture invalide' }) });

module.exports = { phone, password, uuidParam, factureIdParam };
