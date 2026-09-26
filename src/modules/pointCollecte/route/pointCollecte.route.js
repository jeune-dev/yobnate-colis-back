const router = require('express').Router();
const ctrl = require('../controller/pointCollecte.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { upload } = require('../../../middlewares/upload.middleware');
const {
  createPointSchema,
  updatePointSchema,
  toggleSchema,
  maintenanceSchema,
  transfertStockSchema,
} = require('../validation/pointCollecte.validation');
const { uuidParam } = require('../../../validations/common');

/**
 * Réseau des points de collecte (agences, points relais, casiers, hubs).
 * Lecture ouverte à tout utilisateur connecté ; écriture réservée aux administrateurs.
 */
// Le back-office des points expose le stock (destinataires) et les coordonnées des
// responsables : réservé au personnel. Le public dispose de /public/points-collecte.
router.use(auth, checkActiveUser, personnel);

router.get('/', ctrl.getAll);
router.get('/reseau', ctrl.getReseau);
router.get('/:id', validate(uuidParam, 'params'), ctrl.getOne);
router.get('/:id/stock', validate(uuidParam, 'params'), ctrl.stock);
router.get('/:id/statistiques', validate(uuidParam, 'params'), ctrl.statistiques);

router.post('/', admin, validate(createPointSchema), ctrl.create);
router.put('/:id', admin, validate(uuidParam, 'params'), validate(updatePointSchema), ctrl.update);
router.patch(
  '/:id/statut',
  admin,
  validate(uuidParam, 'params'),
  validate(toggleSchema),
  ctrl.toggle
);
router.patch(
  '/:id/maintenance',
  admin,
  validate(uuidParam, 'params'),
  validate(maintenanceSchema),
  ctrl.maintenance
);
router.post(
  '/:id/transfert-stock',
  admin,
  validate(uuidParam, 'params'),
  validate(transfertStockSchema),
  ctrl.transfertStock
);
router.post('/:id/photo', admin, validate(uuidParam, 'params'), upload.single('photo'), ctrl.photo);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
