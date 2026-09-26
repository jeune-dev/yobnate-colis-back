const router = require('express').Router();
const ctrl = require('../controller/dashboard.controller');
const auth = require('../../../middlewares/auth.middleware');
const { admin } = require('../../../middlewares/requireRole.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const validate = require('../../../middlewares/validate.middleware');
const { periodeQuery } = require('../../mesure/validation/mesure.validation');

/** Tableau de bord administrateur. */
router.use(auth, checkActiveUser, admin);

router.get('/stats', ctrl.stats);
router.get('/kpis', validate(periodeQuery, 'query'), ctrl.kpis);
router.get('/conversion', validate(periodeQuery, 'query'), ctrl.conversion);
router.get('/marketing', validate(periodeQuery, 'query'), ctrl.marketing);
router.get('/evaluations', validate(periodeQuery, 'query'), ctrl.evaluations);
router.get('/stock', ctrl.stock);
router.get('/colis-par-statut', ctrl.parStatut);
router.get('/par-pays', ctrl.parPays);
router.get('/utilisateurs-actifs', ctrl.utilisateursActifs);
router.get('/villes-depart', ctrl.villesDepart);
router.get('/villes-arrivee', ctrl.villesArrivee);
router.get('/activites', ctrl.activites);
router.get('/derniers-utilisateurs', ctrl.derniersUtilisateurs);
router.get('/derniers-colis', ctrl.derniersColis);
router.get('/points-attention', ctrl.pointsAttention);

module.exports = router;
