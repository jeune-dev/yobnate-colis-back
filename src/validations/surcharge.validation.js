const Joi = require('joi');
const { pays, devise } = require('./shared');
const {
  TYPES_SURCHARGE,
  MODES_SURCHARGE,
  ASSIETTES_SURCHARGE,
} = require('../constants/facturation');

const createSurchargeSchema = Joi.object({
  code: Joi.string().min(2).max(30).uppercase().required(),
  libelle: Joi.string().min(2).max(120).required(),
  type: Joi.string()
    .valid(...TYPES_SURCHARGE)
    .required(),
  mode: Joi.string()
    .valid(...MODES_SURCHARGE)
    .default('pourcentage'),
  valeur: Joi.number().min(0).required(),
  assiette: Joi.string()
    .valid(...ASSIETTES_SURCHARGE)
    .default('fret'),
  devise: devise.default('XOF'),
  montantMinimum: Joi.number().min(0).allow(null),
  montantMaximum: Joi.number().min(0).allow(null),
  serviceId: Joi.string().uuid().allow(null),
  paysApplication: pays.allow(null),
  automatique: Joi.boolean().default(true),
  internationalUniquement: Joi.boolean().default(false),
  soumiseTva: Joi.boolean().default(true),
  ordreApplication: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const updateSurchargeSchema = Joi.object({
  code: Joi.string().min(2).max(30).uppercase(),
  libelle: Joi.string().min(2).max(120),
  type: Joi.string().valid(...TYPES_SURCHARGE),
  mode: Joi.string().valid(...MODES_SURCHARGE),
  valeur: Joi.number().min(0),
  assiette: Joi.string().valid(...ASSIETTES_SURCHARGE),
  devise: devise,
  montantMinimum: Joi.number().min(0).allow(null),
  montantMaximum: Joi.number().min(0).allow(null),
  serviceId: Joi.string().uuid().allow(null),
  paysApplication: pays.allow(null),
  automatique: Joi.boolean(),
  internationalUniquement: Joi.boolean(),
  soumiseTva: Joi.boolean(),
  ordreApplication: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
}).min(1);

const toggleSchema = Joi.object({ isActive: Joi.boolean().required() });

const simulerSchema = Joi.object({
  fret: Joi.number().min(0).required(),
  poidsKg: Joi.number().positive().default(1),
  valeurDeclaree: Joi.number().min(0).default(0),
});

module.exports = { createSurchargeSchema, updateSurchargeSchema, toggleSchema, simulerSchema };
