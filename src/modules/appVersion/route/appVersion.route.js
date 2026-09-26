const router = require('express').Router();
const ctrl = require('../controller/appVersion.controller');
const validate = require('../../../middlewares/validate.middleware');
const { plateformeQuery } = require('../validation/appVersion.validation');

// Public : l'application mobile vérifie sa version avant toute connexion
router.get('/', validate(plateformeQuery, 'query'), ctrl.getActive);

module.exports = router;
