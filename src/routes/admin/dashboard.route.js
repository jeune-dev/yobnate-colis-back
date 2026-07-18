const router = require('express').Router();
const dashboardController = require('../../controllers/admin/dashboard.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');

/**
 * @swagger
 * tags:
 *   name: Admin - Dashboard
 *   description: Statistiques et indicateurs de pilotage
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Statistiques globales (utilisateurs, colis, taux livraison…)
 *     responses:
 *       200: { description: Statistiques globales }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/stats', dashboardController.getStats);

/**
 * @swagger
 * /admin/dashboard/colis-par-statut:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Répartition des colis par statut
 *     responses:
 *       200: { description: Nombre de colis par statut }
 */
router.get('/colis-par-statut', dashboardController.getColisParStatut);

/**
 * @swagger
 * /admin/dashboard/utilisateurs-actifs:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Clients les plus actifs (nombre de colis)
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Top clients }
 */
router.get('/utilisateurs-actifs', dashboardController.getUtilisateursActifs);

/**
 * @swagger
 * /admin/dashboard/villes-frequentes:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Villes de départ les plus utilisées
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Top villes de départ }
 */
router.get('/villes-frequentes', dashboardController.getVillesFrequentes);

/**
 * @swagger
 * /admin/dashboard/destinations-frequentes:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Villes de destination les plus fréquentes
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Top destinations }
 */
router.get('/destinations-frequentes', dashboardController.getDestinationsFrequentes);

/**
 * @swagger
 * /admin/dashboard/activites-recentes:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Dernières activités du journal
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Dernières activités }
 */
router.get('/activites-recentes', dashboardController.getActivitesRecentes);

/**
 * @swagger
 * /admin/dashboard/derniers-utilisateurs:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Derniers clients inscrits
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Derniers utilisateurs }
 */
router.get('/derniers-utilisateurs', dashboardController.getDerniersUtilisateurs);

/**
 * @swagger
 * /admin/dashboard/derniers-colis:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Derniers colis créés
 *     parameters:
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Derniers colis }
 */
router.get('/derniers-colis', dashboardController.getDerniersColis);

module.exports = router;
