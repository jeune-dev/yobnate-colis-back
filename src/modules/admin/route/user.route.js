const router = require('express').Router();
const ctrl = require('../controller/user.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  conditionsCommercialesSchema,
  listeClientsQuery,
} = require('../validation/user.validation');
const { uuidParam, statutActifSchema } = require('../../../validations/common');

/** Gestion des comptes clients. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeClientsQuery, 'query'), ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/colis', validate(uuidParam, 'params'), ctrl.getColis);
router.patch(
  '/:id/statut',
  validate(uuidParam, 'params'),
  validate(statutActifSchema),
  ctrl.toggle
);
router.patch(
  '/:id/conditions-commerciales',
  validate(uuidParam, 'params'),
  validate(conditionsCommercialesSchema),
  ctrl.conditionsCommerciales
);

module.exports = router;
