const Joi = require('joi');
const { listeQuery, filtres } = require('../../../validations/common');
const { DEVISES, STATUTS_FACTURE } = require('../../../config/facturation');
const { PAYEURS } = require('../../../config/colis');

const appliquerRemiseSchema = Joi.object({
  remise: Joi.number().min(0).precision(2).required(),
  motif: Joi.string().max(255).allow('', null),
});

const annulerFactureSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

const prolongerEcheanceSchema = Joi.object({
  dateLimitePaiement: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
});

const emettreAvoirSchema = Joi.object({
  montant: Joi.number().positive().precision(2).required(),
  motif: Joi.string().min(3).max(255).required(),
});

const listeFacturesQuery = listeQuery({
  userId: filtres.id,
  statut: filtres.valeurs(STATUTS_FACTURE),
  type: filtres.valeurs(['expedition', 'enlevement', 'stockage', 'douane', 'avoir', 'divers']),
  devise: filtres.valeurs(DEVISES),
  payeur: filtres.valeurs(PAYEURS),
  reference: filtres.recherche,
  impayees: filtres.booleen,
  echues: filtres.booleen,
  dateDebut: filtres.date,
  dateFin: filtres.date,
});

module.exports = {
  listeFacturesQuery,
  appliquerRemiseSchema,
  annulerFactureSchema,
  prolongerEcheanceSchema,
  emettreAvoirSchema,
};
