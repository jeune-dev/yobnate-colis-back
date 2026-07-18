const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { authRateLimit } = require('../middlewares/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema
} = require('../validations/auth.validation');

/**
 * @swagger
 * tags:
 *   name: Authentification
 *   description: Inscription, connexion, refresh token, mot de passe
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Authentification]
 *     summary: Créer un compte client
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, prenom, email, telephone, password]
 *             properties:
 *               nom: { type: string, minLength: 2, maxLength: 50 }
 *               prenom: { type: string, minLength: 2, maxLength: 50 }
 *               email: { type: string, format: email }
 *               telephone: { type: string, example: "+221771234567" }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: Compte créé }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       409: { $ref: '#/components/responses/Conflict' }
 */
router.post('/register', authRateLimit, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentification]
 *     summary: Se connecter
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Connexion réussie — accessToken dans le corps, refreshToken en cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     expiresIn: { type: string }
 *                     utilisateur: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/login', authRateLimit, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags: [Authentification]
 *     summary: Rafraîchir le token d'accès
 *     security: []
 *     description: Le refreshToken peut être fourni via cookie httpOnly ou dans le corps.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Nouveau accessToken émis }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Authentification]
 *     summary: Se déconnecter
 *     responses:
 *       200: { description: Déconnexion réussie }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/logout', auth, authController.logout);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Authentification]
 *     summary: Demander un code OTP de réinitialisation
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Email envoyé si le compte existe }
 */
router.post('/forgot-password', authRateLimit, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Authentification]
 *     summary: Réinitialiser le mot de passe avec le code OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, minLength: 6, maxLength: 6 }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Mot de passe réinitialisé }
 *       400: { $ref: '#/components/responses/BadRequest' }
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     tags: [Authentification]
 *     summary: Changer son mot de passe (utilisateur connecté)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Mot de passe modifié }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.put('/change-password', auth, validate(changePasswordSchema), authController.changePassword);
router.patch('/change-password', auth, validate(changePasswordSchema), authController.changePassword);

module.exports = router;
