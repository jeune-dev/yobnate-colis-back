const Joi = require('joi');

const phone = Joi.string().pattern(/^\+?[0-9]{8,15}$/).message('Numéro de téléphone invalide');

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
