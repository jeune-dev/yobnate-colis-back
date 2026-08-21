const router = require('express').Router();
const ctrl = require('../../controllers/admin/tarif.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  createTarifSchema,
  updateTarifSchema,
  creerGrilleSchema,
} = require('../../validations/tarif.validation');
const { uuidParam } = require('../../validations/shared');

/** Grille tarifaire (service × corridor × tranche de poids). */
router.use(auth, checkActiveUser);

router.get('/', ctrl.getAll);
router.get('/audit', admin, ctrl.audit);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createTarifSchema), ctrl.create);
router.post('/grille', admin, validate(creerGrilleSchema), ctrl.creerGrille);
router.put('/:id', admin, validate(uuidParam, 'params'), validate(updateTarifSchema), ctrl.update);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
