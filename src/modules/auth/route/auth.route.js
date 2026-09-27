const router = require('express').Router();
const authController = require('../controller/auth.controller');
const auth = require('../../../middlewares/auth.middleware');
const validate = require('../../../middlewares/validate.middleware');
const checkActiveUser = require('../../../middlewares/checkActiveUser.middleware');
const {
  authRateLimit,
  connexionRateLimit,
  otpEmailRateLimit,
  mutationRateLimit,
} = require('../../../middlewares/rateLimit.middleware');
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifierEmailSchema,
  renvoyerVerificationSchema,
  resetPasswordSchema,
  changePasswordSchema,
} = require('../validation/auth.validation');

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
 *             required: [password]
 *             description: Un identifiant parmi `identifiant` (email ou téléphone), `email`, `telephone`.
 *             properties:
 *               identifiant: { type: string, description: Email ou numéro de téléphone }
 *               email: { type: string, format: email }
 *               telephone: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           Connexion réussie — accessToken et refreshToken dans le corps ; le
 *           refreshToken est aussi posé en cookie httpOnly.
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
 *                     refreshToken: { type: string }
 *                     expiresIn: { type: string }
 *                     utilisateur: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: Compte désactivé, ou email non confirmé (si exigé) }
 *       429: { description: Trop de tentatives }
 */
router.post('/login', ...connexionRateLimit, validate(loginSchema), authController.login);

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
// Confirmation de l'adresse email (lien envoyé à l'inscription)
router.post(
  '/verify-email',
  authRateLimit,
  validate(verifierEmailSchema),
  authController.verifierEmail
);
router.get(
  '/verify-email/:token',
  validate(verifierEmailSchema, 'params'),
  authController.verifierEmailLien
);
router.post(
  '/resend-verification',
  authRateLimit,
  validate(renvoyerVerificationSchema),
  authController.renvoyerVerification
);

router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Authentification]
 *     summary: Se déconnecter
 *     description: >
 *       Publique : aboutit même avec un jeton d'accès expiré. Révoque le refresh
 *       token (cookie ou corps) et, s'il est authentique, le jeton d'accès présenté.
 *     security: []
 *     responses:
 *       200: { description: Déconnexion réussie }
 */
router.post('/logout', validate(refreshTokenSchema), authController.logout);

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
router.post(
  '/forgot-password',
  authRateLimit,
  otpEmailRateLimit,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Authentification]
 *     summary: Réinitialiser le mot de passe avec le code OTP
 *     description: >
 *       Le code est invalidé après 5 essais erronés (un nouveau code doit être
 *       demandé). En cas de succès, toutes les sessions du compte sont révoquées.
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
 *       429: { description: Trop de tentatives }
 */
router.post(
  '/reset-password',
  authRateLimit,
  otpEmailRateLimit,
  validate(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @swagger
 * /auth/change-password:
 *   patch:
 *     tags: [Authentification]
 *     summary: Changer son mot de passe (utilisateur connecté)
 *     description: >
 *       Accepte PUT et PATCH. Les jetons d'accès émis avant le changement sont
 *       immédiatement refusés (401) : le client doit se reconnecter.
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
const gardesChangement = [auth, checkActiveUser, mutationRateLimit, validate(changePasswordSchema)];
router.put('/change-password', ...gardesChangement, authController.changePassword);
router.patch('/change-password', ...gardesChangement, authController.changePassword);

module.exports = router;
