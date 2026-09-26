const router = require('express').Router();
const ctrl = require('../controller/faq.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  creerFaqSchema,
  modifierFaqSchema,
  listeFaqQuery,
} = require('../validation/faq.validation');
const { uuidParam } = require('../../../validations/common');

/** Rédaction de la FAQ du site vitrine et de l'application. */
router.use(auth, checkActiveUser, admin);

router.get('/', validate(listeFaqQuery, 'query'), ctrl.lister);
router.post('/', validate(creerFaqSchema), ctrl.creer);
router.put('/:id', validate(uuidParam, 'params'), validate(modifierFaqSchema), ctrl.modifier);
router.delete('/:id', validate(uuidParam, 'params'), ctrl.supprimer);

module.exports = router;
