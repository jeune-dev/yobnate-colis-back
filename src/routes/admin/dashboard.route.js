const router = require('express').Router();
const ctrl = require('../../controllers/admin/dashboard.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

/** Tableau de bord administrateur. */
router.use(auth, checkActiveUser, admin);

router.get('/stats', ctrl.stats);
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
