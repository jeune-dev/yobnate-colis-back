const router = require('express').Router();
const ctrl = require('../../controllers/admin/surcharge.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createSurchargeSchema,
  updateSurchargeSchema,
  toggleSchema,
  simulerSchema,
} = require('../../validations/surcharge.validation');
const { uuidParam } = require('../../validations/shared');

/** Surcharges et frais annexes appliqués par le moteur de tarification. */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', validate(createSurchargeSchema), ctrl.create);
router.post('/simuler', validate(simulerSchema), ctrl.simuler);
router.put('/:id', validate(uuidParam, 'params'), validate(updateSurchargeSchema), ctrl.update);
router.patch('/:id/statut', validate(uuidParam, 'params'), validate(toggleSchema), ctrl.toggle);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
