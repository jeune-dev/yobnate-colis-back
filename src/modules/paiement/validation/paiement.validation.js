const Joi = require('joi');
const {
  DEVISES,
  METHODES_PAIEMENT,
  STATUTS_PAIEMENT,
  STATUTS_FACTURE,
} = require('../../../config/facturation');
const { listeQuery, filtres } = require('../../../validations/common');

const recordPaiementSchema = Joi.object({
  methode: Joi.string()
    .valid(...METHODES_PAIEMENT)
    .required(),
  referenceTransaction: Joi.string().max(100).allow('', null),
  montant: Joi.number().positive().precision(2).required(),
  pointCollecteId: Joi.string().uuid().allow(null),
  commentaire: Joi.string().max(500).allow('', null),
});

const rembourserSchema = Joi.object({
  montant: Joi.number().positive().precision(2).allow(null),
  motif: Joi.string().min(3).max(255).required(),
});

const marquerEchoueSchema = Joi.object({
  motif: Joi.string().max(255).allow('', null),
});

const listePaiementsQuery = listeQuery({
  statut: filtres.valeurs(STATUTS_PAIEMENT),
  methode: filtres.valeurs(METHODES_PAIEMENT),
  devise: filtres.valeurs(DEVISES),
  userId: filtres.id,
  factureId: filtres.id,
  pointCollecteId: filtres.id,
  reference: filtres.recherche,
  referenceTransaction: filtres.recherche,
  dateDebut: filtres.date,
  dateFin: filtres.date,
});

const mesFacturesQuery = listeQuery({
  statut: filtres.valeurs(STATUTS_FACTURE),
  impayees: filtres.booleen,
});

module.exports = {
  listePaiementsQuery,
  mesFacturesQuery,
  recordPaiementSchema,
  rembourserSchema,
  marquerEchoueSchema,
};
