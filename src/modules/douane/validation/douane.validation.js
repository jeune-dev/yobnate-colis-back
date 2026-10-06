const Joi = require('joi');
const { articleDouaneSchema } = require('../../colis/validation/colis.validation');
const { TYPES_CONTENU, INCOTERMS } = require('../../../config/colis');
const { CODES_PAYS } = require('../../../config/pays');
const { listeQuery, filtres } = require('../../../validations/common');

const updateDeclarationSchema = Joi.object({
  motifExport: Joi.string().valid(...TYPES_CONTENU),
  incoterm: Joi.string().valid('DAP', 'DDP'),
  numeroEori: Joi.string().max(20).allow('', null),
  numeroNinea: Joi.string().max(20).allow('', null),
  numeroTvaIntracom: Joi.string().max(20).allow('', null),
  numeroDeclaration: Joi.string().max(50).allow('', null),
  commentaire: Joi.string().max(1000).allow('', null),
}).min(1);

const definirArticlesSchema = Joi.object({
  articles: Joi.array().items(articleDouaneSchema).min(1).max(50).required(),
});

const ajouterArticleSchema = articleDouaneSchema;

const changerStatutSchema = Joi.object({
  statut: Joi.string().valid('soumise', 'en_cours', 'bloquee', 'dedouanee', 'refusee').required(),
  numeroDeclaration: Joi.string().max(50).allow('', null),
  motifBlocage: Joi.string()
    .max(500)
    .when('statut', {
      is: Joi.valid('bloquee', 'refusee'),
      then: Joi.required(),
      otherwise: Joi.allow('', null),
    }),
  droitsReels: Joi.number().min(0).allow(null),
  taxesReelles: Joi.number().min(0).allow(null),
});

const ajouterDocumentSchema = Joi.object({
  type: Joi.string()
    .valid('facture_commerciale', 'certificat_origine', 'licence', 'autorisation', 'justificatif')
    .default('justificatif'),
  libelle: Joi.string().max(150).allow('', null),
});

const listeDeclarationsQuery = listeQuery({
  statut: filtres.valeurs(['brouillon', 'soumise', 'en_cours', 'bloquee', 'dedouanee', 'refusee']),
  paysImport: filtres.valeurs(CODES_PAYS),
  motifExport: filtres.valeurs(TYPES_CONTENU),
  incoterm: filtres.valeurs(INCOTERMS),
  numeroDeclaration: filtres.recherche,
  aTraiter: filtres.booleen,
});

module.exports = {
  listeDeclarationsQuery,
  updateDeclarationSchema,
  definirArticlesSchema,
  ajouterArticleSchema,
  changerStatutSchema,
  ajouterDocumentSchema,
};
