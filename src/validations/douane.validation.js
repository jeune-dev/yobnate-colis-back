const Joi = require('joi');
const { articleDouaneSchema } = require('./colis.validation');

const updateDeclarationSchema = Joi.object({
  motifExport: Joi.string(),
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

module.exports = {
  updateDeclarationSchema,
  definirArticlesSchema,
  ajouterArticleSchema,
  changerStatutSchema,
  ajouterDocumentSchema,
};
