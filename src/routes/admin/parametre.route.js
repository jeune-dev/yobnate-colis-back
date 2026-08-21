const router = require('express').Router();
const ctrl = require('../../controllers/admin/parametre.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin, superAdmin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  updateParametreSchema,
  updatePlusieursSchema,
} = require('../../validations/parametre.validation');

/** Paramètres de réglage du moteur métier (taux, délais, seuils). */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.get('/:cle', ctrl.getOne);
router.post('/initialiser', superAdmin, ctrl.initialiser);
router.put('/lot', superAdmin, validate(updatePlusieursSchema), ctrl.updatePlusieurs);
router.put('/:cle', superAdmin, validate(updateParametreSchema), ctrl.update);

module.exports = router;
