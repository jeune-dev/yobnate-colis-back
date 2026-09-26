const Joi = require('joi');

const note = Joi.number().integer().min(1).max(5).messages({
  'number.min': 'La note va de 1 à 5',
  'number.max': 'La note va de 1 à 5',
});

const deposerAvisSchema = Joi.object({
  note: note.required(),
  titre: Joi.string().trim().max(120).allow('', null),
  commentaire: Joi.string().trim().max(1000).allow('', null),
  colisId: Joi.string().uuid().allow(null),
});

const modererAvisSchema = Joi.object({
  statut: Joi.string().valid('publie', 'rejete').required(),
  motifRejet: Joi.string()
    .trim()
    .max(255)
    .when('statut', {
      is: 'rejete',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null),
    }),
  reponse: Joi.string().trim().max(1000).allow('', null),
});

const listeAvisAdminQuery = Joi.object({
  statut: Joi.string().valid('en_attente', 'publie', 'rejete'),
  note,
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

const listeAvisPublicQuery = Joi.object({
  note,
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(50),
});

module.exports = {
  deposerAvisSchema,
  modererAvisSchema,
  listeAvisAdminQuery,
  listeAvisPublicQuery,
};
