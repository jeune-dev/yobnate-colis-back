const router = require('express').Router();
const ctrl = require('../controller/reclamationAdmin.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  assignerSchema,
  repondreSupportSchema,
  resoudreSchema,
  prioriteSchema,
} = require('../validation/reclamation.validation');
const { uuidParam } = require('../../../validations/common');

/** Service après-vente : réclamations et indemnisations. */
router.use(auth, checkActiveUser, admin);

router.get('/statistiques', ctrl.statistiques);
router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);

router.patch(
  '/:id/assigner',
  validate(uuidParam, 'params'),
  validate(assignerSchema),
  ctrl.assigner
);
router.post(
  '/:id/messages',
  validate(uuidParam, 'params'),
  upload.array('pieces', 5),
  validate(repondreSupportSchema),
  ctrl.repondre
);
router.patch(
  '/:id/resoudre',
  validate(uuidParam, 'params'),
  validate(resoudreSchema),
  ctrl.resoudre
);
router.patch(
  '/:id/priorite',
  validate(uuidParam, 'params'),
  validate(prioriteSchema),
  ctrl.priorite
);

module.exports = router;
