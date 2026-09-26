const Joi = require('joi');
const { phone } = require('../../../validations/common');

const updateProfilSchema = Joi.object({
  nom: Joi.string().min(2).max(50),
  prenom: Joi.string().min(2).max(50),
  telephone: phone,
  adresse: Joi.string().max(255).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  villeId: Joi.string().uuid().allow(null),
  raisonSociale: Joi.string().max(150).allow('', null),
  numeroIdentificationFiscale: Joi.string().max(30).allow('', null),
  numeroTvaIntracom: Joi.string().max(20).allow('', null),
  langue: Joi.string().valid('fr'),
}).min(1);

const updatePreferencesSchema = Joi.object({
  notificationsEmail: Joi.boolean(),
  notificationsSms: Joi.boolean(),
  notificationsWhatsapp: Joi.boolean(),
  notificationsPush: Joi.boolean(),
}).min(1);

const updateDeviceTokenSchema = Joi.object({
  token: Joi.string().max(255).required(),
  platform: Joi.string().valid('ios', 'android').required(),
});

/** Code à 6 chiffres reçu pour prouver la possession du numéro de téléphone. */
const verifierTelephoneSchema = Joi.object({
  code: Joi.string()
    .pattern(/^\d{6}$/)
    .required(),
});

module.exports = {
  updateProfilSchema,
  updatePreferencesSchema,
  updateDeviceTokenSchema,
  verifierTelephoneSchema,
};
