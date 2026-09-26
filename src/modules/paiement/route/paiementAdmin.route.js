const router = require('express').Router();
const ctrl = require('../controller/paiementAdmin.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  recordPaiementSchema,
  rembourserSchema,
  marquerEchoueSchema,
} = require('../validation/paiement.validation');
const { uuidParam, factureIdParam } = require('../../../validations/common');
const { Paiement } = require('../../../models');
const perimetre = require('../../../utils/perimetre');
const { siUuid } = require('../../../middlewares/perimetre.middleware');

/** Encaissements et remboursements. */
router.use(auth, checkActiveUser, personnel);

// Agent : encaissements de son point ; coursier : ceux qu'il a enregistrés
router.param(
  'id',
  siUuid(perimetre.exigerPerimetre(Paiement, perimetre.paiements, 'Paiement introuvable'))
);

router.get('/statistiques', admin, ctrl.statistiques);
router.get('/export', admin, ctrl.exporter);
router.get('/caisse/:pointId', ctrl.caisse);
router.get('/', ctrl.getAll);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);

router.post(
  '/factures/:factureId',
  validate(factureIdParam, 'params'),
  validate(recordPaiementSchema),
  ctrl.enregistrer
);
router.patch(
  '/:id/rembourser',
  admin,
  validate(uuidParam, 'params'),
  validate(rembourserSchema),
  ctrl.rembourser
);
router.patch(
  '/:id/echec',
  admin,
  validate(uuidParam, 'params'),
  validate(marquerEchoueSchema),
  ctrl.marquerEchoue
);

module.exports = router;
