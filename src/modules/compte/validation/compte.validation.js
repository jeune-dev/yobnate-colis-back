const Joi = require('joi');

const supprimerCompteSchema = Joi.object({
  password: Joi.string().max(72).required(),
  motif: Joi.string().trim().max(500).allow('', null),
});

const demandeSuppressionSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(150).required(),
  motif: Joi.string().trim().max(1000).allow('', null),
});

const listerDemandesQuery = Joi.object({
  statut: Joi.string().valid('en_attente', 'traitee', 'rejetee'),
});

const traiterDemandeSchema = Joi.object({
  statut: Joi.string().valid('traitee', 'rejetee').required(),
  noteAdmin: Joi.string().trim().max(1000).allow('', null),
});

module.exports = {
  supprimerCompteSchema,
  demandeSuppressionSchema,
  listerDemandesQuery,
  traiterDemandeSchema,
};
