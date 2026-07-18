const router = require('express').Router();
const adminController = require('../../controllers/admin/admin.controller');
const auth = require('../../middlewares/auth.middleware');
const { admin, superAdmin } = require('../../middlewares/admin.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { createAdminSchema, updateAdminSchema } = require('../../validations/user.validation');
const { uuidParam } = require('../../validations/shared');

/**
 * @swagger
 * tags:
 *   name: Admin - Administrateurs
 *   description: Gestion des comptes admin (Super Admin uniquement pour création/modification)
 */

router.use(auth, checkActiveUser, admin);

/**
 * @swagger
 * /admin/admins:
 *   get:
 *     tags: [Admin - Administrateurs]
 *     summary: Lister les administrateurs
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: role, in: query, schema: { type: string, enum: [admin, super_admin] } }
 *     responses:
 *       200: { description: Liste des administrateurs }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', adminController.getAll);

/**
 * @swagger
 * /admin/admins/{id}:
 *   get:
 *     tags: [Admin - Administrateurs]
 *     summary: Détail d'un administrateur
 *     parameters:
 *       - $ref: '#/components/parameters/idParam'
 *     responses:
 *       200: { description: Détail de l'administrateur }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validate(uuidParam, 'params'), adminController.getOne);

/**
 * @swagger
 * /admin/admins:
 *   post:
 *     tags: [Admin - Administrateurs]
 *     summary: Créer un administrateur (Super Admin uniquement)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, telephone, password]
 *             properties:
 *               nom: { type: string }
 *               prenom: { type: string }
 *               email: { type: string, format: email }
 *               telephone: { type: string }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [admin, super_admin], default: admin }
 *     responses:
 *       201: { description: Administrateur créé }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/', superAdmin, validate(createAdminSchema), adminController.create);

/**
 * @swagger
 * /admin/admins/{id}:
 *   put:
 *     tags: [Admin - Administrateurs]
 *     summary: Modifier un administrateur (Super Admin uniquement)
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
 *               prenom: { type: string }
 *               telephone: { type: string }
 *               role: { type: string, enum: [admin, super_admin] }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Administrateur mis à jour }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put('/:id', superAdmin, validate(uuidParam, 'params'), validate(updateAdminSchema), adminController.update);

module.exports = router;
