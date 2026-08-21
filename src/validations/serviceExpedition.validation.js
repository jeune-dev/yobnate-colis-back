const Joi = require('joi');
const { heureHHMM } = require('./shared');
const { MODES_TRANSPORT } = require('../constants/reseau');
const { TYPES_CONTENU } = require('../constants/colis');

const createServiceSchema = Joi.object({
  code: Joi.string().min(2).max(20).uppercase().required(),
  nom: Joi.string().min(2).max(80).required(),
  description: Joi.string().max(500).allow('', null),
  modeTransport: Joi.string()
    .valid(...MODES_TRANSPORT)
    .default('aerien'),
  delaiMinJours: Joi.number().integer().min(0).max(120).required(),
  delaiMaxJours: Joi.number().integer().min(0).max(180).required(),
  joursOuvresUniquement: Joi.boolean().default(true),
  heureLimiteDepot: heureHHMM.allow(null),
  coefficientVolumetrique: Joi.number().integer().min(1000).max(10000).default(5000),
  poidsMinKg: Joi.number().positive().default(0.1),
  poidsMaxKg: Joi.number().positive().default(70),
  dimensionsMaxCm: Joi.number().integer().min(10).allow(null),
  typesContenuAutorises: Joi.array()
    .items(Joi.string().valid(...TYPES_CONTENU))
    .default(TYPES_CONTENU),
  assuranceIncluse: Joi.number().min(0).default(0),
  suiviDetaille: Joi.boolean().default(true),
  livraisonSamedi: Joi.boolean().default(false),
  ordreAffichage: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
});

const updateServiceSchema = Joi.object({
  code: Joi.string().min(2).max(20).uppercase(),
  nom: Joi.string().min(2).max(80),
  description: Joi.string().max(500).allow('', null),
  modeTransport: Joi.string().valid(...MODES_TRANSPORT),
  delaiMinJours: Joi.number().integer().min(0).max(120),
  delaiMaxJours: Joi.number().integer().min(0).max(180),
  joursOuvresUniquement: Joi.boolean(),
  heureLimiteDepot: heureHHMM.allow(null),
  coefficientVolumetrique: Joi.number().integer().min(1000).max(10000),
  poidsMinKg: Joi.number().positive(),
  poidsMaxKg: Joi.number().positive(),
  dimensionsMaxCm: Joi.number().integer().min(10).allow(null),
  typesContenuAutorises: Joi.array().items(Joi.string().valid(...TYPES_CONTENU)),
  assuranceIncluse: Joi.number().min(0),
  suiviDetaille: Joi.boolean(),
  livraisonSamedi: Joi.boolean(),
  ordreAffichage: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
}).min(1);

const toggleSchema = Joi.object({ isActive: Joi.boolean().required() });

module.exports = { createServiceSchema, updateServiceSchema, toggleSchema };
