const Joi = require('joi');
const { METHODES_PAIEMENT } = require('../constants/facturation');

const recordPaiementSchema = Joi.object({
  methode: Joi.string()
    .valid(...METHODES_PAIEMENT)
    .required(),
  referenceTransaction: Joi.string().max(100).allow('', null),
  montant: Joi.number().positive().precision(2).required(),
  pointCollecteId: Joi.string().uuid().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
});

const rembourserSchema = Joi.object({
  montant: Joi.number().positive().precision(2).allow(null),
  motif: Joi.string().min(3).max(255).required(),
});

const marquerEchoueSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

module.exports = { recordPaiementSchema, rembourserSchema, marquerEchoueSchema };
