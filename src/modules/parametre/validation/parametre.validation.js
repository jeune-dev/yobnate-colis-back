const Joi = require('joi');

/** Valeur d'un paramètre : texte (JSON compris) borné, nombre ou booléen. */
const valeur = Joi.alternatives().try(Joi.string().max(10000), Joi.number(), Joi.boolean());

const updateParametreSchema = Joi.object({
  valeur: valeur.required(),
});

const updatePlusieursSchema = Joi.object({
  valeurs: Joi.object().pattern(Joi.string().max(100), valeur).min(1).required(),
});

module.exports = { updateParametreSchema, updatePlusieursSchema };
