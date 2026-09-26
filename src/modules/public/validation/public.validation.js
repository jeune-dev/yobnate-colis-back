const Joi = require('joi');
const { pays } = require('../../../validations/common');
const { CATEGORIES_COLIS } = require('../../../config/colis');
const { MODES_TRANSPORT, EMPLACEMENTS_ANNONCE } = require('../../../config/reseau');

const zoneQuery = Joi.object({
  pays,
  codePostal: Joi.string().pattern(/^\d{2,5}$/),
  villeId: Joi.string().uuid(),
  emplacement: Joi.string().valid(...EMPLACEMENTS_ANNONCE),
});

const tarifsQuery = Joi.object({
  categorie: Joi.string().valid(...CATEGORIES_COLIS),
  modeTransport: Joi.string().valid(...MODES_TRANSPORT),
  paysDepart: pays,
  paysArrivee: pays,
});

const emballagesQuery = Joi.object({
  categorie: Joi.string().valid(...CATEGORIES_COLIS),
  type: Joi.string().valid('contenant', 'prestation'),
});

const desabonnementParam = Joi.object({
  jeton: Joi.string()
    .trim()
    .min(16)
    .max(128)
    .pattern(/^[A-Za-z0-9_-]+$/)
    .required(),
});

module.exports = { zoneQuery, tarifsQuery, emballagesQuery, desabonnementParam };
