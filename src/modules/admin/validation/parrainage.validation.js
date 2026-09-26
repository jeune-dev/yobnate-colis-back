const Joi = require('joi');

const ajusterCreditSchema = Joi.object({
  creditParrainage: Joi.number().min(0).max(100000).required(),
  motif: Joi.string().max(255).allow('', null),
});

module.exports = { ajusterCreditSchema };
