const router = require('express').Router();
const ctrl = require('../controller/articleTarif.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  createArticleTarifSchema,
  updateArticleTarifSchema,
  listeArticlesTarifQuery,
} = require('../validation/catalogue.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { ArticleTarif } = require('../../../models');

/** Grille forfaitaire : prix par article, colonnes Dakar et autres régions. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeArticlesTarifQuery, 'query'), ctrl.getAll);
router.post('/', validate(createArticleTarifSchema), ctrl.create);
router.put(
  '/:id',
  validate(uuidParam, 'params'),
  verrou(ArticleTarif),
  validate(updateArticleTarifSchema),
  ctrl.update
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);
router.post('/:id/photo', validate(uuidParam, 'params'), upload.single('photo'), ctrl.photo);

module.exports = router;
