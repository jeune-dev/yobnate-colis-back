const router = require('express').Router();
const userController = require('../../controllers/admin/user.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Utilisateurs
 *   description: Gestion des comptes clients
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin - Utilisateurs]
 *     summary: Lister les clients
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: isActive, in: query, schema: { type: boolean } }
 *       - { name: sortBy, in: query, schema: { type: string, enum: [createdAt, nom, lastLoginAt] } }
 *       - { name: sortOrder, in: query, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200:
 *         description: Liste des clients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     utilisateurs: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', userController.getAll);

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin - Utilisateurs]
 *     summary: Détail d'un client avec ses statistiques
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail du client }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), userController.getOne);

/**
 * @swagger
 * /admin/users/{id}/colis:
 *   get:
 *     tags: [Admin - Utilisateurs]
 *     summary: Colis d'un client
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200: { description: Liste des colis du client }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id/colis', validate(uuidParam, 'params'), userController.getColis);

/**
 * @swagger
 * /admin/users/{id}/activer:
 *   patch:
 *     tags: [Admin - Utilisateurs]
 *     summary: Activer un compte client
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Compte activé }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/activer', validate(uuidParam, 'params'), userController.activer);

/**
 * @swagger
 * /admin/users/{id}/desactiver:
 *   patch:
 *     tags: [Admin - Utilisateurs]
 *     summary: Désactiver un compte client
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Compte désactivé }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/desactiver', validate(uuidParam, 'params'), userController.desactiver);

module.exports = router;
