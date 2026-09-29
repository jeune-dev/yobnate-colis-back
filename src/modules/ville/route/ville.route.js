const router = require('express').Router();
const ctrl = require('../controller/ville.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin, personnel } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { createVilleSchema, updateVilleSchema } = require('../validation/ville.validation');
const { uuidParam, statutActifSchema } = require('../../../validations/common');
const verrou = require('../../../middlewares/verrouOptimiste.middleware');
const { Ville } = require('../../../models');

/** Référentiel des villes desservies (France et Sénégal). */
router.use(auth, checkActiveUser);

// Lecture réservée au personnel (admin, coursier, agent) : les clients passent par les
// variantes publiques (/public/…, /publiques, /publics), qui n'exposent que l'actif.
router.get('/', personnel, ctrl.getAll);
router.get('/publiques', ctrl.getPubliques);
router.get('/:id', personnel, validate(uuidParam, 'params'), ctrl.getOne);
router.post('/', admin, validate(createVilleSchema), ctrl.create);
router.put(
  '/:id',
  admin,
  validate(uuidParam, 'params'),
  verrou(Ville),
  validate(updateVilleSchema),
  ctrl.update
);
router.patch(
  '/:id/statut',
  admin,
  validate(uuidParam, 'params'),
  validate(statutActifSchema),
  ctrl.toggle
);
router.delete('/:id', admin, validate(uuidParam, 'params'), ctrl.remove);

module.exports = router;
