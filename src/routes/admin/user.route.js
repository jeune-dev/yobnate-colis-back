const router = require('express').Router();
const ctrl = require('../../controllers/admin/user.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { conditionsCommercialesSchema } = require('../../validations/user.validation');
const { uuidParam } = require('../../validations/shared');

/** Gestion des comptes clients. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/colis', validate(uuidParam, 'params'), ctrl.getColis);
router.patch('/:id/statut', validate(uuidParam, 'params'), ctrl.toggle);
router.patch(
  '/:id/conditions-commerciales',
  validate(uuidParam, 'params'),
  validate(conditionsCommercialesSchema),
  ctrl.conditionsCommerciales
);

module.exports = router;
