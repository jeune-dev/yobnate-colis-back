const router = require('express').Router();
const ctrl = require('../controller/avis.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { modererAvisSchema, listeAvisAdminQuery } = require('../validation/avis.validation');
const { uuidParam } = require('../../../validations/common');

/** Modération des avis clients : publication, rejet motivé, réponse de l'entreprise. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeAvisAdminQuery, 'query'), ctrl.lister);
router.patch(
  '/:id/moderation',
  validate(uuidParam, 'params'),
  validate(modererAvisSchema),
  ctrl.moderer
);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.supprimer);

module.exports = router;
