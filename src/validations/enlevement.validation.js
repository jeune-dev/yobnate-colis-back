const Joi = require('joi');
const { pays } = require('./shared');
const { CRENEAUX_ENLEVEMENT } = require('../constants/reseau');

const creerEnlevementSchema = Joi.object({
  colisId: Joi.string().uuid().allow(null),
  contactNom: Joi.string().min(2).max(120).required(),
  contactTelephone: Joi.string().max(20).required(),
  pays: pays.required(),
  villeId: Joi.string().uuid().required(),
  adresse: Joi.string().min(3).max(255).required(),
  complementAdresse: Joi.string().max(255).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  dateSouhaitee: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  creneau: Joi.string()
    .valid(...CRENEAUX_ENLEVEMENT)
    .required(),
  nbColis: Joi.number().integer().min(1).max(100).default(1),
  poidsEstimeKg: Joi.number().positive().max(1000).allow(null),
  instructions: Joi.string().max(500).allow('', null),
});

const modifierEnlevementSchema = Joi.object({
  contactNom: Joi.string().min(2).max(120),
  contactTelephone: Joi.string().max(20),
  adresse: Joi.string().min(3).max(255),
  complementAdresse: Joi.string().max(255).allow('', null),
  dateSouhaitee: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  creneau: Joi.string().valid(...CRENEAUX_ENLEVEMENT),
  nbColis: Joi.number().integer().min(1).max(100),
  instructions: Joi.string().max(500).allow('', null),
}).min(1);

const annulerEnlevementSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

const planifierSchema = Joi.object({
  coursierId: Joi.string().uuid().required(),
  pointDepotId: Joi.string().uuid().allow(null),
  datePlanifiee: Joi.date().iso().allow(null),
  creneau: Joi.string()
    .valid(...CRENEAUX_ENLEVEMENT)
    .allow(null),
});

const cloturerSchema = Joi.object({
  statut: Joi.string().valid('effectue', 'echoue').required(),
  motifEchec: Joi.string().max(255).when('statut', { is: 'echoue', then: Joi.required() }),
  commentaire: Joi.string().max(500).allow('', null),
  pointDepotId: Joi.string().uuid().allow(null),
});

module.exports = {
  creerEnlevementSchema,
  modifierEnlevementSchema,
  annulerEnlevementSchema,
  planifierSchema,
  cloturerSchema,
};
