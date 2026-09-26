const router = require('express').Router();
const ctrl = require('../controller/compte.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { uuidParam } = require('../../../validations/common');
const { listerDemandesQuery, traiterDemandeSchema } = require('../validation/compte.validation');

router.use(auth, checkActiveUser, admin);

router.get('/', validate(listerDemandesQuery, 'query'), ctrl.listerDemandes);
router.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(traiterDemandeSchema),
  ctrl.traiterDemande
);

module.exports = router;
