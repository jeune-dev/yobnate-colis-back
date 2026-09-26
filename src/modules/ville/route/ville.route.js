const router = require('express').Router();
const ctrl = require('../controller/ville.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { createVilleSchema, updateVilleSchema } = require('../validation/ville.validation');
const { uuidParam, statutActifSchema } = require('../../../validations/common');

/** Référentiel des villes desservies (France et Sénégal). */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getAll);
router.get('/publiques', ctrl.getPubliques);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createVilleSchema), ctrl.create);
router.put('/:id', admin, validate(uuidParam, 'params'), validate(updateVilleSchema), ctrl.update);
router.patch(
  '/:id/statut',
  admin,
  validate(uuidParam, 'params'),
  validate(statutActifSchema),
  ctrl.toggle
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
