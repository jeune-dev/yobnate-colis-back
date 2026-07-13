const Joi = require('joi');

const calculerPrixSchema = Joi.object({
  villeDepartId: Joi.string().uuid().required(),
  villeArriveeId: Joi.string().uuid().required(),
  typeColis: Joi.string().valid('standard', 'express', 'fragile').default('standard'),
  poids: Joi.number().positive().precision(2).max(9999).required()
});

const createTarifSchema = Joi.object({
  villeDepartId: Joi.string().uuid().required(),
  villeArriveeId: Joi.string().uuid().required(),
  typeColis: Joi.string().valid('standard', 'express', 'fragile').default('standard'),
  prixParKg: Joi.number().positive().precision(2).required(),
  prixFixe: Joi.number().min(0).precision(2).default(0),
  delaiEstimeJours: Joi.number().integer().min(0).max(90).required(),
  isActive: Joi.boolean().default(true)
});

const updateTarifSchema = Joi.object({
  prixParKg: Joi.number().positive().precision(2),
  prixFixe: Joi.number().min(0).precision(2),
  delaiEstimeJours: Joi.number().integer().min(0).max(90),
  isActive: Joi.boolean()
}).min(1);

module.exports = { calculerPrixSchema, createTarifSchema, updateTarifSchema };
