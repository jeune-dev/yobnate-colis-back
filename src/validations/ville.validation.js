const Joi = require('joi');

const createVilleSchema = Joi.object({
  nom: Joi.string().min(2).max(80).required(),
  pays: Joi.string().valid('FR', 'SN').required(),
  region: Joi.string().max(80).allow('', null),
  isActive: Joi.boolean().default(true)
});

const updateVilleSchema = Joi.object({
  nom: Joi.string().min(2).max(80),
  pays: Joi.string().valid('FR', 'SN'),
  region: Joi.string().max(80).allow('', null),
  isActive: Joi.boolean()
}).min(1);

module.exports = { createVilleSchema, updateVilleSchema };
