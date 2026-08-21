const Joi = require('joi');
const { pays } = require('./shared');
const { MODES_TRANSPORT } = require('../constants/reseau');

const createRotationSchema = Joi.object({
  modeTransport: Joi.string()
    .valid(...MODES_TRANSPORT)
    .default('aerien'),
  paysDepart: pays.required(),
  paysArrivee: pays.required(),
  hubDepartId: Joi.string().uuid().allow(null),
  hubArriveeId: Joi.string().uuid().allow(null),
  transporteur: Joi.string().max(100).allow('', null),
  numeroVol: Joi.string().max(30).allow('', null),
  numeroConteneur: Joi.string().max(30).allow('', null),
  dateCloture: Joi.date().iso().allow(null),
  dateDepartPrevue: Joi.date().iso().required(),
  dateArriveePrevue: Joi.date().iso().required(),
  capacitePoidsKg: Joi.number().positive().allow(null),
  capaciteColis: Joi.number().integer().positive().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
});

const updateRotationSchema = Joi.object({
  hubDepartId: Joi.string().uuid().allow(null),
  hubArriveeId: Joi.string().uuid().allow(null),
  transporteur: Joi.string().max(100).allow('', null),
  numeroVol: Joi.string().max(30).allow('', null),
  numeroConteneur: Joi.string().max(30).allow('', null),
  dateCloture: Joi.date().iso().allow(null),
  dateDepartPrevue: Joi.date().iso(),
  dateArriveePrevue: Joi.date().iso(),
  capacitePoidsKg: Joi.number().positive().allow(null),
  capaciteColis: Joi.number().integer().positive().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
}).min(1);

const chargerColisSchema = Joi.object({
  colisIds: Joi.array().items(Joi.string().uuid()).min(1).max(500).required(),
});

const changerStatutSchema = Joi.object({
  statut: Joi.string()
    .valid('ouverte', 'cloturee', 'en_transit', 'arrivee', 'dechargee', 'annulee')
    .required(),
  commentaire: Joi.string().max(500).allow('', null),
});

module.exports = {
  createRotationSchema,
  updateRotationSchema,
  chargerColisSchema,
  changerStatutSchema,
};
