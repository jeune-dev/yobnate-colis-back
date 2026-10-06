const router = require('express').Router();
const ctrl = require('../controller/emballage.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  createEmballageSchema,
  updateEmballageSchema,
  retirerPhotoSchema,
  listeEmballagesQuery,
} = require('../validation/catalogue.validation');
const { uuidParam } = require('../../../validations/common');

/** Emballages : barigots et cartons à la vente, prestation d'emballage sur site. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeEmballagesQuery, 'query'), ctrl.getAll);
router.post('/', validate(createEmballageSchema), ctrl.create);
router.put('/:id', validate(uuidParam, 'params'), validate(updateEmballageSchema), ctrl.update);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 6),
  ctrl.ajouterPhotos
);
router.delete(
  '/:id/photos',
  validate(uuidParam, 'params'),
  validate(retirerPhotoSchema),
  ctrl.retirerPhoto
);

module.exports = router;
