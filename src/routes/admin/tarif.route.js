const router = require('express').Router();
const tarifController = require('../../controllers/admin/tarif.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { calculerPrixSchema, createTarifSchema, updateTarifSchema } = require('../../validations/tarif.validation');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Tarifs
 *   description: Gestion de la grille tarifaire (prix par kg selon trajet ville→ville)
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/tarifs:
 *   get:
 *     tags: [Admin - Tarifs]
 *     summary: Lister tous les tarifs
 *     parameters:
 *       - { name: villeDepartId, in: query, schema: { type: string, format: uuid } }
 *       - { name: villeArriveeId, in: query, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Liste des tarifs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     tarifs: { type: array, items: { $ref: '#/components/schemas/Tarif' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', tarifController.getAll);

/**
 * @swagger
 * /admin/tarifs/calculer-prix:
 *   post:
 *     tags: [Admin - Tarifs]
 *     summary: Calculer le prix d'un colis selon le trajet et le poids
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [villeDepartId, villeArriveeId, poids]
 *             properties:
 *               villeDepartId: { type: string, format: uuid }
 *               villeArriveeId: { type: string, format: uuid }
 *               poids: { type: number, minimum: 0.1 }
 *     responses:
 *       200: { description: Prix calculé }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/calculer-prix', validate(calculerPrixSchema), tarifController.calculerPrix);

/**
 * @swagger
 * /admin/tarifs/{id}:
 *   get:
 *     tags: [Admin - Tarifs]
 *     summary: Détail d'un tarif
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail du tarif }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), tarifController.getOne);

/**
 * @swagger
 * /admin/tarifs:
 *   post:
 *     tags: [Admin - Tarifs]
 *     summary: Créer un tarif pour un trajet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [villeDepartId, villeArriveeId, prixParKg]
 *             properties:
 *               villeDepartId: { type: string, format: uuid }
 *               villeArriveeId: { type: string, format: uuid }
 *               prixParKg: { type: number, minimum: 0 }
 *               prixMinimum: { type: number, minimum: 0 }
 *     responses:
 *       201: { description: Tarif créé }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', validate(createTarifSchema), tarifController.create);

/**
 * @swagger
 * /admin/tarifs/{id}:
 *   put:
 *     tags: [Admin - Tarifs]
 *     summary: Modifier un tarif
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prixParKg: { type: number, minimum: 0 }
 *               prixMinimum: { type: number, minimum: 0 }
 *     responses:
 *       200: { description: Tarif mis à jour }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put('/:id', validate(uuidParam, 'params'), validate(updateTarifSchema), tarifController.update);

module.exports = router;
