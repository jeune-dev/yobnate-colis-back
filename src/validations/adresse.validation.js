const Joi = require('joi');
const { phone, pays } = require('./shared');

const createAdresseSchema = Joi.object({
  libelle: Joi.string().min(2).max(80).required(),
  type: Joi.string().valid('expediteur', 'destinataire', 'les_deux').default('destinataire'),
  nom: Joi.string().min(2).max(120).required(),
  entreprise: Joi.string().max(120).allow('', null),
  telephone: phone.required(),
  telephoneSecondaire: phone.allow('', null),
  email: Joi.string().email().max(150).allow('', null),
  pays: pays.required(),
  villeId: Joi.string().uuid().required(),
  adresse: Joi.string().min(3).max(255).required(),
  complementAdresse: Joi.string().max(255).allow('', null),
  quartier: Joi.string().max(100).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  instructions: Joi.string().max(500).allow('', null),
  pointRetraitPrefereId: Joi.string().uuid().allow(null),
  parDefaut: Joi.boolean().default(false),
});

const updateAdresseSchema = Joi.object({
  libelle: Joi.string().min(2).max(80),
  type: Joi.string().valid('expediteur', 'destinataire', 'les_deux'),
  nom: Joi.string().min(2).max(120),
  entreprise: Joi.string().max(120).allow('', null),
  telephone: phone,
  telephoneSecondaire: phone.allow('', null),
  email: Joi.string().email().max(150).allow('', null),
  pays: pays,
  villeId: Joi.string().uuid(),
  adresse: Joi.string().min(3).max(255),
  complementAdresse: Joi.string().max(255).allow('', null),
  quartier: Joi.string().max(100).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  instructions: Joi.string().max(500).allow('', null),
  pointRetraitPrefereId: Joi.string().uuid().allow(null),
  parDefaut: Joi.boolean(),
}).min(1);

module.exports = { createAdresseSchema, updateAdresseSchema };
