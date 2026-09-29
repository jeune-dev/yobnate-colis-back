const router = require('express').Router();
const ctrl = require('../controller/tarif.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const {
  createTarifSchema,
  updateTarifSchema,
  creerGrilleSchema,
} = require('../validation/tarif.validation');
const { uuidParam } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { Tarif } = require('../../../models');

/** Grille tarifaire (service × corridor × tranche de poids). */
router.use(auth, checkActiveUser);

// Lecture réservée au personnel (admin, coursier, agent) : les clients passent par les
// variantes publiques (/public/…, /publiques, /publics), qui n'exposent que l'actif.
router.get('/', personnel, ctrl.getAll);
router.get('/audit', admin, ctrl.audit);
router.get('/:id', personnel, validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createTarifSchema), ctrl.create);
router.post('/grille', admin, validate(creerGrilleSchema), ctrl.creerGrille);
router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  verrou(Tarif),
  validate(updateTarifSchema),
  ctrl.update
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
