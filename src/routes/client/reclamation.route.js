const router = require('express').Router();
const ctrl = require('../../controllers/client/reclamation.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const {
  ouvrirReclamationSchema,
  repondreSchema,
  noterSchema,
} = require('../../validations/reclamation.validation');
const { uuidParam } = require('../../validations/shared');

/** Réclamations du client connecté (service après-vente). */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getMes);
router.post('/', upload.array('pieces', 5), validate(ouvrirReclamationSchema), ctrl.create);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post(
  '/:id/messages',
  validate(uuidParam, 'params'),
  upload.array('pieces', 5),
  validate(repondreSchema),
  ctrl.repondre
);
router.patch('/:id/note', validate(uuidParam, 'params'), validate(noterSchema), ctrl.noter);

module.exports = router;
