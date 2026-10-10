const router = require('express').Router();
const ctrl = require('../controller/demandeContact.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { uuidParam } = require('../../../validations/common');
const {
  listerDemandesQuery,
  traiterDemandeSchema,
} = require('../validation/demandeContact.validation');

/** Demandes de contact des sites vitrines : consultation et réponse par email. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listerDemandesQuery, 'query'), ctrl.lister);
router.get('/:id', validate(uuidParam, 'params'), ctrl.detail);
router.post(
  '/:id/traiter',
  validate(uuidParam, 'params'),
  validate(traiterDemandeSchema),
  ctrl.traiter
);

module.exports = router;
