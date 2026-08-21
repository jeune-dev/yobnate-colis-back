const Joi = require('joi');
const { devise } = require('./shared');

const ouvrirReclamationSchema = Joi.object({
  colisId: Joi.string().uuid().allow(null),
  type: Joi.string()
    .valid('perte', 'avarie', 'retard', 'erreur_livraison', 'facturation', 'douane', 'autre')
    .required(),
  objet: Joi.string().min(3).max(150).required(),
  description: Joi.string().min(10).max(2000).required(),
  montantReclame: Joi.number().min(0).default(0),
  devise: devise,
  priorite: Joi.string().valid('basse', 'normale', 'haute', 'critique'),
});

const repondreSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
});

const repondreSupportSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  interne: Joi.boolean().default(false),
});

const noterSchema = Joi.object({
  note: Joi.number().integer().min(1).max(5).required(),
});

const assignerSchema = Joi.object({
  agentId: Joi.string().uuid().required(),
});

const resoudreSchema = Joi.object({
  statut: Joi.string()
    .valid('en_cours', 'attente_client', 'resolue', 'rejetee', 'cloturee')
    .required(),
  resolution: Joi.string().max(2000).when('statut', { is: 'resolue', then: Joi.required() }),
  motifRejet: Joi.string().max(500).when('statut', { is: 'rejetee', then: Joi.required() }),
  montantAccorde: Joi.number().min(0).allow(null),
});

const prioriteSchema = Joi.object({
  priorite: Joi.string().valid('basse', 'normale', 'haute', 'critique').required(),
});

module.exports = {
  ouvrirReclamationSchema,
  repondreSchema,
  repondreSupportSchema,
  noterSchema,
  assignerSchema,
  resoudreSchema,
  prioriteSchema,
};
