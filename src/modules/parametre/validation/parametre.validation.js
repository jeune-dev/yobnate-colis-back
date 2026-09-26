const Joi = require('joi');

const updateParametreSchema = Joi.object({
  valeur: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).required(),
});

const updatePlusieursSchema = Joi.object({
  valeurs: Joi.object()
    .pattern(Joi.string(), Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()))
    .min(1)
    .required(),
});

module.exports = { updateParametreSchema, updatePlusieursSchema };
