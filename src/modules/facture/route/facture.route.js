const router = require('express').Router();
const ctrl = require('../controller/facture.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  appliquerRemiseSchema,
  annulerFactureSchema,
  prolongerEcheanceSchema,
  emettreAvoirSchema,
  listeFacturesQuery,
} = require('../validation/facture.validation');
const { uuidParam } = require('../../../validations/common');

/** Facturation des expéditions. */
router.use(auth, checkActiveUser, admin);

router.get('/statistiques', ctrl.statistiques);
router.get('/export', validate(listeFacturesQuery, 'query'), ctrl.exporter);
router.get('/', validate(listeFacturesQuery, 'query'), ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/document', validate(uuidParam, 'params'), ctrl.document);

router.patch(
  '/:id/remise',
  validate(uuidParam, 'params'),
  validate(appliquerRemiseSchema),
  ctrl.appliquerRemise
);
router.patch(
  '/:id/annuler',
  validate(uuidParam, 'params'),
  validate(annulerFactureSchema),
  ctrl.annuler
);
router.patch(
  '/:id/echeance',
  validate(uuidParam, 'params'),
  validate(prolongerEcheanceSchema),
  ctrl.prolongerEcheance
);
router.post(
  '/:id/avoir',
  validate(uuidParam, 'params'),
  validate(emettreAvoirSchema),
  ctrl.emettreAvoir
);
router.post('/:id/relance', validate(uuidParam, 'params'), ctrl.relancer);
router.post('/relances', ctrl.relancerEchues);

module.exports = router;
