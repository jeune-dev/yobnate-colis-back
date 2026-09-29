const router = require('express').Router();
const ctrl = require('../controller/appVersion.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { AppVersion } = require('../../../models');
const {
  creerVersionSchema,
  modifierVersionSchema,
} = require('../validation/appVersion.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.post('/', validate(creerVersionSchema), ctrl.create);
router.put(
  '/:id',
  validate(uuidParam, 'params'),
  verrou(AppVersion),
  validate(modifierVersionSchema),
  ctrl.update
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
