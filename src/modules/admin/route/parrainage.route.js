const router = require('express').Router();
const ctrl = require('../controller/parrainage.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { uuidParam } = require('../../../validations/common');
const { ajusterCreditSchema } = require('../validation/parrainage.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getParrains);
router.get('/:id/filleuls', validate(uuidParam, 'params'), ctrl.getFilleuls);
router.patch(
  '/:id/credit',
  validate(uuidParam, 'params'),
  validate(ajusterCreditSchema),
  ctrl.ajusterCredit
);

module.exports = router;
