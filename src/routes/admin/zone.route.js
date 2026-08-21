const router = require('express').Router();
const ctrl = require('../../controllers/admin/zone.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createZoneSchema,
  updateZoneSchema,
  affecterVillesSchema,
} = require('../../validations/zone.validation');
const { uuidParam } = require('../../validations/shared');

/** Zones tarifaires, regroupant des villes d'un même pays. */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createZoneSchema), ctrl.create);
router.put('/:id', admin, validate(uuidParam, 'params'), validate(updateZoneSchema), ctrl.update);
router.post(
  '/:id/villes',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterVillesSchema),
  ctrl.affecterVilles
);
router.delete(
  '/:id/villes',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterVillesSchema),
  ctrl.retirerVilles
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
