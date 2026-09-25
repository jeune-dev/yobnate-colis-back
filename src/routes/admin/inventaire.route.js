const router = require('express').Router();
const Joi = require('joi');
const ctrl = require('../../controllers/admin/inventaire.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');

const inventaireQuery = Joi.object({
  rotationId: Joi.string().uuid(),
  tourneeCollecteId: Joi.string().uuid(),
  format: Joi.string().valid('json', 'csv', 'html').default('json'),
}).or('rotationId', 'tourneeCollecteId');

/** Inventaire imprimable des produits chargés, par conteneur ou par tournée de collecte. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(inventaireQuery, 'query'), ctrl.getInventaire);

module.exports = router;
