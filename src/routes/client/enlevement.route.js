const router = require('express').Router();
const ctrl = require('../../controllers/client/enlevement.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  creerEnlevementSchema,
  modifierEnlevementSchema,
  annulerEnlevementSchema,
} = require('../../validations/enlevement.validation');
const { uuidParam } = require('../../validations/shared');

/** Demandes d'enlèvement à domicile du client connecté. */
router.use(auth, checkActiveUser);

router.get('/creneaux', ctrl.creneaux);
router.get('/', ctrl.getMes);
router.post('/', validate(creerEnlevementSchema), ctrl.create);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.put('/:id', validate(uuidParam, 'params'), validate(modifierEnlevementSchema), ctrl.update);
router.patch(
  '/:id/annuler',
  validate(uuidParam, 'params'),
  validate(annulerEnlevementSchema),
  ctrl.annuler
);

module.exports = router;
