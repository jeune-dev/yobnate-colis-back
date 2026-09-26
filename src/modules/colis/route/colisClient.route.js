const router = require('express').Router();
const ctrl = require('../controller/colisClient.controller');
const auth = require('../../../middlewares/auth.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const parseJsonFields = require('../../../middlewares/parseJsonFields.middleware');
const { upload, uploadColis } = require('../../../middlewares/upload.middleware');
const {
  devisSchema,
  declarerColisSchema,
  annulerColisSchema,
  abonnerSuiviSchema,
  modifierColisClientSchema,
  repondrePropositionSchema,
} = require('../validation/colis.validation');
const { uuidParam } = require('../../../validations/common');

/** Déclaration et suivi des expéditions du client connecté. */
router.use(auth, checkActiveUser);

router.post('/devis', validate(devisSchema), ctrl.devis);
router.get('/', ctrl.getMes);
router.get('/recus', ctrl.getRecus);
// Formulaire multipart : photos (champ « photos ») et message vocal facultatif (champ « vocal »)
router.post(
  '/',
  uploadColis,
  parseJsonFields('pieces', 'articlesDouane', 'articles', 'emballages', 'infosCollecte'),
  validate(declarerColisSchema),
  ctrl.declarer
);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
// Correction de la demande tant que le colis n'est pas arrivé au Sénégal
router.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(modifierColisClientSchema),
  ctrl.modifier
);
// Catégorie 3 : réponse à la proposition tarifaire
router.post('/:id/proposition/accepter', validate(uuidParam, 'params'), ctrl.accepterProposition);
router.post(
  '/:id/proposition/refuser',
  validate(uuidParam, 'params'),
  validate(repondrePropositionSchema),
  ctrl.refuserProposition
);
router.get('/:id/suivi', validate(uuidParam, 'params'), ctrl.suivi);
router.get('/:id/etiquettes', validate(uuidParam, 'params'), ctrl.etiquettes);
router.get('/:id/bordereau', validate(uuidParam, 'params'), ctrl.bordereau);
router.get('/:id/facture-commerciale', validate(uuidParam, 'params'), ctrl.factureCommerciale);
router.patch(
  '/:id/annuler',
  validate(uuidParam, 'params'),
  validate(annulerColisSchema),
  ctrl.annuler
);
router.post(
  '/:id/photos',
  validate(uuidParam, 'params'),
  upload.array('photos', 10),
  ctrl.ajouterPhotos
);
router.post('/:id/vocal', validate(uuidParam, 'params'), uploadColis, ctrl.deposerVocal);
router.post(
  '/:id/abonnement-suivi',
  validate(uuidParam, 'params'),
  validate(abonnerSuiviSchema),
  ctrl.abonnerSuivi
);

module.exports = router;
