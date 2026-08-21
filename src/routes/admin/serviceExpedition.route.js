const router = require('express').Router();
const ctrl = require('../../controllers/admin/serviceExpedition.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createServiceSchema,
  updateServiceSchema,
  toggleSchema,
} = require('../../validations/serviceExpedition.validation');
const { uuidParam } = require('../../validations/shared');

/** Catalogue des services d'expédition (Express, Standard, Économique). */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getAll);
router.get('/publics', ctrl.getPublics);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createServiceSchema), ctrl.create);
router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  validate(updateServiceSchema),
  ctrl.update
);
router.patch(
  '/:id/statut',
  admin,
  validate(uuidParam, 'params'),
  validate(toggleSchema),
  ctrl.toggle
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
