const Joi = require('joi');
const { pays } = require('./shared');

const createVilleSchema = Joi.object({
  nom: Joi.string().min(2).max(80).required(),
  pays: pays.required(),
  region: Joi.string().max(80).allow('', null),
  zoneId: Joi.string().uuid().allow(null),
  codesPostaux: Joi.array().items(Joi.string().max(10)).default([]),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isZoneEloignee: Joi.boolean().default(false),
  livraisonDomicileDisponible: Joi.boolean().default(true),
  enlevementDomicileDisponible: Joi.boolean().default(true),
  isActive: Joi.boolean().default(true),
});

const updateVilleSchema = Joi.object({
  nom: Joi.string().min(2).max(80),
  pays: pays,
  region: Joi.string().max(80).allow('', null),
  zoneId: Joi.string().uuid().allow(null),
  codesPostaux: Joi.array().items(Joi.string().max(10)),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isZoneEloignee: Joi.boolean(),
  livraisonDomicileDisponible: Joi.boolean(),
  enlevementDomicileDisponible: Joi.boolean(),
  isActive: Joi.boolean(),
}).min(1);

module.exports = { createVilleSchema, updateVilleSchema };
