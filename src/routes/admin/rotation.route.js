const router = require('express').Router();
const ctrl = require('../../controllers/admin/rotation.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createRotationSchema,
  updateRotationSchema,
  chargerColisSchema,
  changerStatutSchema,
} = require('../../validations/rotation.validation');
const { uuidParam } = require('../../validations/shared');

/** Rotations : départs groupés (aériens ou maritimes) reliant les deux pays. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/embarquables', ctrl.embarquables);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/manifeste', validate(uuidParam, 'params'), ctrl.manifeste);
router.post('/', validate(createRotationSchema), ctrl.create);
router.put('/:id', validate(uuidParam, 'params'), validate(updateRotationSchema), ctrl.update);
router.post(
  '/:id/colis',
  validate(uuidParam, 'params'),
  validate(chargerColisSchema),
  ctrl.chargerColis
);
router.delete(
  '/:id/colis',
  validate(uuidParam, 'params'),
  validate(chargerColisSchema),
  ctrl.dechargerColis
);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(changerStatutSchema),
  ctrl.changerStatut
);

module.exports = router;
