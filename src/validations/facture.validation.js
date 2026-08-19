const Joi = require('joi');

const appliquerRemiseSchema = Joi.object({
  remise: Joi.number().min(0).precision(2).required()
});

module.exports = { appliquerRemiseSchema };
