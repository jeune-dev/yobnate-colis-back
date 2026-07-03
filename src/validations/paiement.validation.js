const Joi = require('joi');

const recordPaiementSchema = Joi.object({
  methode: Joi.string().valid('wave', 'orange_money', 'carte', 'virement', 'cash').required(),
  reference: Joi.string().max(100).allow('', null),
  montant: Joi.number().positive().precision(2).required()
});

module.exports = { recordPaiementSchema };
