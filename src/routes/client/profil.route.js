const router = require('express').Router();
const profilController = require('../../controllers/client/profil.controller');
const auth = require('../../middlewares/auth.middleware');
const validate = require('../../middlewares/validate.middleware');
const { upload } = require('../../middlewares/upload.middleware');
const { updateProfilSchema } = require('../../validations/user.validation');

/**
 * @swagger
 * tags:
 *   name: Client - Profil
 *   description: Profil et avatar du client connecté
 */

router.use(auth);

/**
 * @swagger
 * /client/profil:
 *   get:
 *     tags: [Client - Profil]
 *     summary: Récupérer son profil
 *     responses:
 *       200:
 *         description: Profil utilisateur
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: object, properties: { utilisateur: { $ref: '#/components/schemas/User' } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', profilController.get);

/**
 * @swagger
 * /client/profil:
 *   patch:
 *     tags: [Client - Profil]
 *     summary: Mettre à jour son profil (nom, prénom, téléphone)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string, minLength: 2, maxLength: 50 }
 *               prenom: { type: string, minLength: 2, maxLength: 50 }
 *               telephone: { type: string }
 *     responses:
 *       200: { description: Profil mis à jour }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.put('/', validate(updateProfilSchema), profilController.update);
router.patch('/', validate(updateProfilSchema), profilController.update);

/**
 * @swagger
 * /client/profil/avatar:
 *   patch:
 *     tags: [Client - Profil]
 *     summary: Mettre à jour sa photo de profil
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Avatar mis à jour }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.patch('/avatar', upload.single('avatar'), profilController.updateAvatar);

module.exports = router;
