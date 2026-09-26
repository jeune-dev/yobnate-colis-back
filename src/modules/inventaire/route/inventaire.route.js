const router = require('express').Router();
const ctrl = require('../controller/inventaire.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { inventaireQuery } = require('../validation/inventaire.validation');

/** Inventaire imprimable des produits chargés, par conteneur ou par tournée de collecte. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(inventaireQuery, 'query'), ctrl.getInventaire);

module.exports = router;
