const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../../controllers/admin/emballage.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const {
  createEmballageSchema,
  updateEmballageSchema,
} = require('../../validations/catalogue.validation');
const { uuidParam } = require('../../validations/shared');

const retirerPhotoSchema = Joi.object({ publicId: Joi.string().max(150).required() });

/** Emballages : barigots et cartons à la vente, prestation d'emballage sur site. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
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
