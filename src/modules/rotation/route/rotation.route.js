const router = require('express').Router();
const ctrl = require('../controller/rotation.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  repartirCoutSchema,
  createRotationSchema,
  updateRotationSchema,
  chargerColisSchema,
  changerStatutSchema,
} = require('../validation/rotation.validation');
const { uuidParam } = require('../../../validations/common');

/** Rotations : départs groupés (aériens ou maritimes) reliant les deux pays. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/embarquables', ctrl.embarquables);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/manifeste', validate(uuidParam, 'params'), ctrl.manifeste);
router.post('/', validate(createRotationSchema), ctrl.create);
router.put('/:id', validate(uuidParam, 'params'), validate(updateRotationSchema), ctrl.update);
// Coût du conteneur réparti sur les colis au prorata du poids (marge moyenne)
router.post(
  '/:id/cout',
  validate(uuidParam, 'params'),
  validate(repartirCoutSchema),
  ctrl.repartirCout
);
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
