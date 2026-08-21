const router = require('express').Router();
const ctrl = require('../../controllers/admin/douane.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const {
  updateDeclarationSchema,
  definirArticlesSchema,
  ajouterArticleSchema,
  changerStatutSchema,
  ajouterDocumentSchema,
} = require('../../validations/douane.validation');
const { uuidParam, colisIdParam } = require('../../validations/shared');

/** Formalités douanières du corridor France - Sénégal. */
router.use(auth, checkActiveUser, admin);

router.get('/tableau-de-bord', ctrl.tableauDeBord);
router.get('/', ctrl.getAll);
router.get('/colis/:colisId', validate(colisIdParam, 'params'), ctrl.getParColis);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/facture-commerciale', validate(uuidParam, 'params'), ctrl.factureCommerciale);

router.put('/:id', validate(uuidParam, 'params'), validate(updateDeclarationSchema), ctrl.update);
router.put(
  '/:id/articles',
  validate(uuidParam, 'params'),
  validate(definirArticlesSchema),
  ctrl.definirArticles
);
router.post(
  '/:id/articles',
  validate(uuidParam, 'params'),
  validate(ajouterArticleSchema),
  ctrl.ajouterArticle
);
router.delete('/:id/articles/:articleId', validate(uuidParam, 'params'), ctrl.supprimerArticle);
router.post(
  '/:id/documents',
  validate(uuidParam, 'params'),
  upload.single('document'),
  validate(ajouterDocumentSchema),
  ctrl.ajouterDocument
);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(changerStatutSchema),
  ctrl.changerStatut
);

module.exports = router;
