const Joi = require('joi');
const { pays, devise, dateISO } = require('../../../validations/common');

const trancheSchema = Joi.object({
  poidsMinKg: Joi.number().min(0).required(),
  poidsMaxKg: Joi.number().positive().allow(null),
  prixBase: Joi.number().min(0).required(),
  poidsInclusKg: Joi.number().min(0).allow(null),
  prixParKgSupplementaire: Joi.number().min(0).default(0),
  montantMinimum: Joi.number().min(0).default(0),
});

const createTarifSchema = Joi.object({
  serviceId: Joi.string().uuid().required(),
  paysDepart: pays.required(),
  paysArrivee: pays.required(),
  zoneDepartId: Joi.string().uuid().allow(null),
  zoneArriveeId: Joi.string().uuid().allow(null),
  poidsMinKg: Joi.number().min(0).default(0),
  poidsMaxKg: Joi.number().positive().allow(null),
  prixBase: Joi.number().min(0).required(),
  poidsInclusKg: Joi.number().min(0).allow(null),
  prixParKgSupplementaire: Joi.number().min(0).default(0),
  devise: devise.default('XOF'),
  montantMinimum: Joi.number().min(0).default(0),
  dateDebutValidite: dateISO.allow(null),
  dateFinValidite: dateISO.allow(null),
  isActive: Joi.boolean().default(true),
});

const updateTarifSchema = Joi.object({
  poidsMinKg: Joi.number().min(0),
  poidsMaxKg: Joi.number().positive().allow(null),
  prixBase: Joi.number().min(0),
  poidsInclusKg: Joi.number().min(0).allow(null),
  prixParKgSupplementaire: Joi.number().min(0),
  devise: devise,
  montantMinimum: Joi.number().min(0),
  dateDebutValidite: dateISO.allow(null),
  dateFinValidite: dateISO.allow(null),
  isActive: Joi.boolean(),
}).min(1);

const creerGrilleSchema = Joi.object({
  serviceId: Joi.string().uuid().required(),
  paysDepart: pays.required(),
  paysArrivee: pays.required(),
  zoneDepartId: Joi.string().uuid().allow(null),
  zoneArriveeId: Joi.string().uuid().allow(null),
  devise: devise.default('XOF'),
  tranches: Joi.array().items(trancheSchema).min(1).required(),
});

module.exports = {
  createTarifSchema,
  updateTarifSchema,
  creerGrilleSchema,
  trancheSchema,
};
