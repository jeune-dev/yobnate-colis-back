const Joi = require('joi');
const { RUBRIQUES } = require('../../../models/faq.model');

const rubrique = Joi.string().valid(...RUBRIQUES);

const creerFaqSchema = Joi.object({
  question: Joi.string().trim().min(5).max(255).required(),
  reponse: Joi.string().trim().min(2).max(5000).required(),
  rubrique: rubrique.default('general'),
  ordre: Joi.number().integer().min(0).max(1000).default(0),
  isActive: Joi.boolean().default(true),
});

const modifierFaqSchema = Joi.object({
  question: Joi.string().trim().min(5).max(255),
  reponse: Joi.string().trim().min(2).max(5000),
  rubrique,
  ordre: Joi.number().integer().min(0).max(1000),
  isActive: Joi.boolean(),
}).min(1);

const listeFaqQuery = Joi.object({ rubrique });

module.exports = { creerFaqSchema, modifierFaqSchema, listeFaqQuery };
