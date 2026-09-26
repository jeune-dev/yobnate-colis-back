const router = require('express').Router();
const ctrl = require('../controller/colisAdmin.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  updateColisSchema,
  corrigerPeseeSchema,
  enregistrerEvenementSchema,
  enregistrerEvenementLotSchema,
  changerPointRetraitSchema,
  affecterCoursierSchema,
  noteInterneSchema,
  validerDemandeSchema,
  refuserDemandeSchema,
  proposerTarifSchema,
} = require('../validation/colis.validation');
const { uuidParam } = require('../../../validations/common');
const { Colis } = require('../../../models');
const perimetre = require('../../../utils/perimetre');
const { siUuid } = require('../../../middlewares/perimetre.middleware');

/** Back-office des expéditions : acheminement, pesée, incidents, documents. */
router.use(auth, checkActiveUser, personnel);

// Agent et coursier n'accèdent qu'aux colis de leur périmètre (404 sinon)
router.param(
  'id',
  siUuid(perimetre.exigerPerimetre(Colis, perimetre.colis, 'Expédition introuvable'))
);

router.get('/', ctrl.getAll);
router.get('/statistiques', ctrl.statistiques);
router.get('/export', admin, ctrl.exporter);
router.get('/codes-evenements', ctrl.codesEvenements);
router.get('/recherche/:numero', ctrl.rechercher);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/etiquettes', validate(uuidParam, 'params'), ctrl.etiquettes);
router.get('/:id/bordereau', validate(uuidParam, 'params'), ctrl.bordereau);

router.post(
  '/:id/evenements',
  validate(uuidParam, 'params'),
  validate(enregistrerEvenementSchema),
  ctrl.enregistrerEvenement
);
router.post(
  '/evenements/lot',
  admin,
  validate(enregistrerEvenementLotSchema),
  ctrl.enregistrerEvenementLot
);
// Étude des demandes : validation (cat. 2), refus, proposition tarifaire (cat. 3)
router.post(
  '/:id/valider',
  admin,
  validate(uuidParam, 'params'),
  validate(validerDemandeSchema),
  ctrl.valider
);
router.post(
  '/:id/refuser',
  admin,
  validate(uuidParam, 'params'),
  validate(refuserDemandeSchema),
  ctrl.refuser
);
router.post(
  '/:id/proposition',
  admin,
  validate(uuidParam, 'params'),
  validate(proposerTarifSchema),
  ctrl.proposerTarif
);
router.post(
  '/:id/pesee',
  admin,
  validate(uuidParam, 'params'),
  validate(corrigerPeseeSchema),
  ctrl.corrigerPesee
);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 10),
  ctrl.ajouterPhotos
);
router.post(
  '/:id/notes',
  validate(uuidParam, 'params'),
  validate(noteInterneSchema),
  ctrl.ajouterNoteInterne
);
router.post('/:id/code-retrait', admin, validate(uuidParam, 'params'), ctrl.regenererCodeRetrait);

router.put('/:id', admin, validate(uuidParam, 'params'), validate(updateColisSchema), ctrl.update);
router.patch(
  '/:id/point-retrait',
  admin,
  validate(uuidParam, 'params'),
  validate(changerPointRetraitSchema),
  ctrl.changerPointRetrait
);
router.patch(
  '/:id/coursier',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterCoursierSchema),
  ctrl.affecterCoursier
);

module.exports = router;
