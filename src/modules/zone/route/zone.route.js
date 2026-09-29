const router = require('express').Router();
const ctrl = require('../controller/zone.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  createZoneSchema,
  updateZoneSchema,
  affecterVillesSchema,
} = require('../validation/zone.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { Zone } = require('../../../models');

/** Zones tarifaires, regroupant des villes d'un même pays. */
router.use(auth, checkActiveUser);

// Lecture réservée au personnel (admin, coursier, agent) : les clients passent par les
// variantes publiques (/public/…, /publiques, /publics), qui n'exposent que l'actif.
router.get('/', personnel, ctrl.getAll);
router.get('/:id', personnel, validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createZoneSchema), ctrl.create);
router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  verrou(Zone),
  validate(updateZoneSchema),
  ctrl.update
);
router.post(
  '/:id/villes',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterVillesSchema),
  ctrl.affecterVilles
);
router.delete(
  '/:id/villes',
  admin,
  validate(uuidParam, 'params'),
  validate(affecterVillesSchema),
  ctrl.retirerVilles
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
