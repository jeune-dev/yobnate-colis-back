const router = require('express').Router();
const ctrl = require('../controller/personnel.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  createPersonnelSchema,
  updatePersonnelSchema,
  coursiersDisponiblesQuery,
} = require('../validation/user.validation');
const { uuidParam, statutActifSchema } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { User } = require('../../../models');

/** Coursiers et agents de point de collecte. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get(
  '/coursiers-disponibles',
  validate(coursiersDisponiblesQuery, 'query'),
  ctrl.coursiersDisponibles
);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', validate(createPersonnelSchema), ctrl.create);
router.put(
  '/:id',
  validate(uuidParam, 'params'),
  verrou(User),
  validate(updatePersonnelSchema),
  ctrl.update
);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(statutActifSchema),
  ctrl.toggle
);

module.exports = router;
