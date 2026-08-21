const Joi = require('joi');
const { pays } = require('./shared');

const createZoneSchema = Joi.object({
  code: Joi.string().min(2).max(20).required(),
  nom: Joi.string().min(2).max(80).required(),
  pays: pays.required(),
  description: Joi.string().max(255).allow('', null),
  majorationPourcent: Joi.number().min(0).max(100).default(0),
  delaiSupplementaireJours: Joi.number().integer().min(0).max(30).default(0),
  isActive: Joi.boolean().default(true),
});

const updateZoneSchema = Joi.object({
  code: Joi.string().min(2).max(20),
  nom: Joi.string().min(2).max(80),
  description: Joi.string().max(255).allow('', null),
  majorationPourcent: Joi.number().min(0).max(100),
  delaiSupplementaireJours: Joi.number().integer().min(0).max(30),
  isActive: Joi.boolean(),
}).min(1);

const affecterVillesSchema = Joi.object({
  villeIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

module.exports = { createZoneSchema, updateZoneSchema, affecterVillesSchema };
