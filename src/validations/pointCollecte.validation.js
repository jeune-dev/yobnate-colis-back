const Joi = require('joi');
const { pays, heureHHMM } = require('./shared');
const { TYPES_POINT, SERVICES_POINT, JOURS_SEMAINE } = require('../constants/reseau');

const creneauSchema = Joi.object({
  debut: heureHHMM.required(),
  fin: heureHHMM.required(),
});

const horairesSchema = Joi.object(
  Object.fromEntries(
    JOURS_SEMAINE.map((jour) => [jour, Joi.array().items(creneauSchema).default([])])
  )
);

const createPointSchema = Joi.object({
  code: Joi.string().min(2).max(20).uppercase().required(),
  nom: Joi.string().min(2).max(120).required(),
  type: Joi.string()
    .valid(...TYPES_POINT)
    .default('agence'),
  pays: pays.required(),
  villeId: Joi.string().uuid().required(),
  adresse: Joi.string().min(3).max(255).required(),
  complementAdresse: Joi.string().max(255).allow('', null),
  quartier: Joi.string().max(100).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  telephone: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(150).allow('', null),
  horaires: horairesSchema,
  services: Joi.array()
    .items(Joi.string().valid(...SERVICES_POINT))
    .default(['depot', 'retrait']),
  capaciteMaxColis: Joi.number().integer().min(1).allow(null),
  poidsMaxColisKg: Joi.number().positive().allow(null),
  delaiGardeJours: Joi.number().integer().min(1).max(90).default(15),
  responsableId: Joi.string().uuid().allow(null),
  hubRattachementId: Joi.string().uuid().allow(null),
  instructionsAcces: Joi.string().max(500).allow('', null),
  visiblePublic: Joi.boolean().default(true),
  isActive: Joi.boolean().default(true),
});

const updatePointSchema = Joi.object({
  code: Joi.string().min(2).max(20).uppercase(),
  nom: Joi.string().min(2).max(120),
  type: Joi.string().valid(...TYPES_POINT),
  pays: pays,
  villeId: Joi.string().uuid(),
  adresse: Joi.string().min(3).max(255),
  complementAdresse: Joi.string().max(255).allow('', null),
  quartier: Joi.string().max(100).allow('', null),
  codePostal: Joi.string().max(10).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  telephone: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(150).allow('', null),
  horaires: horairesSchema,
  services: Joi.array().items(Joi.string().valid(...SERVICES_POINT)),
  capaciteMaxColis: Joi.number().integer().min(1).allow(null),
  poidsMaxColisKg: Joi.number().positive().allow(null),
  delaiGardeJours: Joi.number().integer().min(1).max(90),
  responsableId: Joi.string().uuid().allow(null),
  hubRattachementId: Joi.string().uuid().allow(null),
  instructionsAcces: Joi.string().max(500).allow('', null),
  visiblePublic: Joi.boolean(),
  isActive: Joi.boolean(),
}).min(1);

const toggleSchema = Joi.object({ isActive: Joi.boolean().required() });

const maintenanceSchema = Joi.object({
  enMaintenance: Joi.boolean().required(),
  motif: Joi.string().max(255).allow('', null),
});

const transfertStockSchema = Joi.object({
  destinationId: Joi.string().uuid().required(),
});

const rechercheGeoSchema = Joi.object({
  pays: pays,
  villeId: Joi.string().uuid(),
  type: Joi.string().valid(...TYPES_POINT),
  service: Joi.string().valid(...SERVICES_POINT),
  codePostal: Joi.string().max(10),
  search: Joi.string().max(100),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  rayonKm: Joi.number().positive().max(500),
}).unknown(true);

module.exports = {
  createPointSchema,
  updatePointSchema,
  toggleSchema,
  maintenanceSchema,
  transfertStockSchema,
  rechercheGeoSchema,
  horairesSchema,
};
