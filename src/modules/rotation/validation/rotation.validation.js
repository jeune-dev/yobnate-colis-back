const Joi = require('joi');
const { pays, devise, listeQuery, filtres } = require('../../../validations/common');
const { MODES_TRANSPORT, STATUTS_ROTATION } = require('../../../config/reseau');
const { CODES_PAYS } = require('../../../config/pays');

const createRotationSchema = Joi.object({
  modeTransport: Joi.string()
    .valid(...MODES_TRANSPORT)
    .default('aerien'),
  paysDepart: pays.required(),
  paysArrivee: pays.required(),
  /** Numéro du conteneur (01, 02…) ; attribué automatiquement s'il est omis. */
  numeroOrdre: Joi.number().integer().min(1).max(9999),
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
  numeroOrdre: Joi.number().integer().min(1).max(9999),
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
    .valid('ouverte', 'cloturee', 'en_transit', 'arrivee', 'en_douane', 'dechargee', 'annulee')
    .required(),
  commentaire: Joi.string().max(500).allow('', null),
});

/** Coût total du conteneur ou du vol, réparti ensuite sur les colis embarqués. */
const repartirCoutSchema = Joi.object({
  coutTotal: Joi.number().min(0).precision(2).required(),
  devise: devise.required(),
});

const listeRotationsQuery = listeQuery({
  statut: filtres.valeurs(STATUTS_ROTATION),
  modeTransport: filtres.valeurs(MODES_TRANSPORT),
  paysDepart: filtres.valeurs(CODES_PAYS),
  paysArrivee: filtres.valeurs(CODES_PAYS),
  ouvertes: filtres.booleen,
  dateDebut: filtres.date,
  dateFin: filtres.date,
});

module.exports = {
  listeRotationsQuery,
  repartirCoutSchema,
  createRotationSchema,
  updateRotationSchema,
  chargerColisSchema,
  changerStatutSchema,
};
