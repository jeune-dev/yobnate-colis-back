const Joi = require('joi');

const appliquerRemiseSchema = Joi.object({
  remise: Joi.number().min(0).precision(2).required(),
  motif: Joi.string().max(255).allow('', null),
});

const annulerFactureSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

const prolongerEcheanceSchema = Joi.object({
  dateLimitePaiement: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
});

const emettreAvoirSchema = Joi.object({
  montant: Joi.number().positive().precision(2).required(),
  motif: Joi.string().min(3).max(255).required(),
});

module.exports = {
  appliquerRemiseSchema,
  annulerFactureSchema,
  prolongerEcheanceSchema,
  emettreAvoirSchema,
};
