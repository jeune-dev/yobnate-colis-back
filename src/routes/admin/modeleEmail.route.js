const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../../controllers/admin/modeleEmail.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { modeleEmailSchema, codeModeleParam } = require('../../validations/catalogue.validation');

const apercuSchema = Joi.object({
  sujet: Joi.string().max(200),
  corpsHtml: Joi.string().max(50000),
});

/** Modèles d'emails personnalisables (sujet et corps, variables {{…}}). */
router.use(auth, checkActiveUser, admin);

router.get('/', ctrl.getAll);
router.put(
  '/:code',
  validate(codeModeleParam, 'params'),
  validate(modeleEmailSchema),
  ctrl.enregistrer
);
router.delete('/:code', validate(codeModeleParam, 'params'), ctrl.reinitialiser);
router.post(
  '/:code/apercu',
  validate(codeModeleParam, 'params'),
  validate(apercuSchema),
  ctrl.apercu
);

module.exports = router;
