const router = require('express').Router();
const villeController = require('../../controllers/admin/ville.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createVilleSchema, updateVilleSchema } = require('../../validations/ville.validation');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Villes
 *   description: Gestion du référentiel des villes
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/villes:
 *   get:
 *     tags: [Admin - Villes]
 *     summary: Lister toutes les villes
 *     parameters:
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: isActive, in: query, schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Liste des villes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     villes: { type: array, items: { $ref: '#/components/schemas/Ville' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', villeController.getAll);

/**
 * @swagger
 * /admin/villes/{id}:
 *   get:
 *     tags: [Admin - Villes]
 *     summary: Détail d'une ville
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail de la ville }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), villeController.getOne);

/**
 * @swagger
 * /admin/villes:
 *   post:
 *     tags: [Admin - Villes]
 *     summary: Créer une ville
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, pays]
 *             properties:
 *               nom: { type: string }
 *               pays: { type: string }
 *               code: { type: string }
 *               isActive: { type: boolean, default: true }
 *     responses:
 *       201: { description: Ville créée }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', validate(createVilleSchema), villeController.create);

/**
 * @swagger
 * /admin/villes/{id}:
 *   put:
 *     tags: [Admin - Villes]
 *     summary: Modifier une ville
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               pays: { type: string }
 *               code: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Ville mise à jour }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.put('/:id', validate(uuidParam, 'params'), validate(updateVilleSchema), villeController.update);

module.exports = router;
