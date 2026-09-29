const router = require('express').Router();
const ctrl = require('../controller/serviceExpedition.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  createServiceSchema,
  updateServiceSchema,
  toggleSchema,
} = require('../validation/serviceExpedition.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { ServiceExpedition } = require('../../../models');

/** Catalogue des services d'expédition (Express, Standard, Économique). */
router.use(auth, checkActiveUser);

// Lecture réservée au personnel (admin, coursier, agent) : les clients passent par les
// variantes publiques (/public/…, /publiques, /publics), qui n'exposent que l'actif.
router.get('/', personnel, ctrl.getAll);
router.get('/publics', ctrl.getPublics);
router.get('/:id', personnel, validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createServiceSchema), ctrl.create);
router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  verrou(ServiceExpedition),
  validate(updateServiceSchema),
  ctrl.update
);
router.patch(
  '/:id/statut',
  admin,
  validate(uuidParam, 'params'),
  validate(toggleSchema),
  ctrl.toggle
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
