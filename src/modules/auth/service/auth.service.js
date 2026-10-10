const crypto = require('crypto');
const motDePasse = require('../../../utils/motDePasse');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, UserOtp, RefreshToken, TokenBlacklist } = require('../../../models');
const { jwtConfig } = require('../../../config/security');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} = require('../../../errors/AppError');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const {
  sendOtpEmail,
  sendBienvenueEmail,
  envoyerModele,
} = require('../../../infrastructure/mailer');
const logger = require('../../../utils/logger');
const { genererCodeParrainage } = require('../../../utils/referenceGenerator');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const parametreService = require('../../parametre/service/parametre.service');
const JWTUtils = require('../../../utils/jwtUtils');

class AuthService {
  static OTP_TTL_MS = 10 * 60 * 1000;
  /** Codes de réinitialisation erronés tolérés avant invalidation du code. */
  static OTP_MAX_TENTATIVES = 5;
  static REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  static sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
  static generateOtpCode = () => String(crypto.randomInt(100000, 1000000));

  /** Empreinte bcrypt sans mot de passe connu, au même coût que les vraies (calculée une fois). */
  static empreinteFactice = () => {
    AuthService.promesseEmpreinte =
      AuthService.promesseEmpreinte || motDePasse.hacher(crypto.randomBytes(16).toString('hex'));
    return AuthService.promesseEmpreinte;
  };

  /** Comparaison à temps constant de deux empreintes hexadécimales. */
  static empreintesEgales = (a, b) =>
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  /**
   * Recherche par email insensible à la casse : les comptes créés avant la
   * normalisation en minuscules peuvent porter des majuscules.
   */
  static trouverParEmail = (email) =>
    User.findOne({
      where: User.sequelize.where(
        User.sequelize.fn('lower', User.sequelize.col('email')),
        String(email || '')
          .trim()
          .toLowerCase()
      ),
    });

  /** Périme les jetons d'accès déjà émis et les sessions de rafraîchissement du compte. */
  static revoquerSessions = async (user) => {
    await user.increment('tokenVersion');
    await RefreshToken.destroy({ where: { userId: user.id } });
    JWTUtils.invaliderCache(user.id);
  };

  static createAndSendResetOtp = async (user) => {
    const code = AuthService.generateOtpCode();
    await UserOtp.create({
      userId: user.id,
      codeHash: AuthService.sha256(code),
      type: 'reset_password',
      expiresAt: new Date(Date.now() + AuthService.OTP_TTL_MS),
    });
    await sendOtpEmail(user, code);
  };

  /** Validité du code de confirmation d'email (minutes). */
  static VERIFICATION_DUREE_MINUTES =
    Number.parseInt(process.env.VERIFICATION_EMAIL_DUREE_MINUTES, 10) || 60;

  /**
   * Code de confirmation de l'adresse email, repris de SIGNS : 6 chiffres, haché
   * en base, valable une heure, 5 essais. Tant qu'il n'est pas confirmé, le compte
   * ne peut pas se connecter ; c'est la confirmation qui ouvre la première session.
   *
   * L'envoi est attendu (et non confié à la file) : l'application doit savoir si le
   * code est vraiment parti, au lieu d'afficher « code envoyé » quand le SMTP n'est
   * pas configuré.
   *
   * @returns {Promise<boolean>} true si l'email est parti.
   */
  static envoyerCodeVerification = async (user) => {
    const code = AuthService.generateOtpCode();
    await UserOtp.update(
      { isUsed: true },
      { where: { userId: user.id, type: 'verification_email', isUsed: false } }
    );
    await UserOtp.create({
      userId: user.id,
      codeHash: AuthService.sha256(code),
      type: 'verification_email',
      expiresAt: new Date(Date.now() + AuthService.VERIFICATION_DUREE_MINUTES * 60 * 1000),
    });
    try {
      await envoyerModele(
        'verification_email',
        user.email,
        { prenom: user.prenom, code, duree: AuthService.VERIFICATION_DUREE_MINUTES },
        { immediat: true }
      );
      return true;
    } catch (err) {
      // Le compte et le code existent : l'utilisateur pourra en redemander un.
      logger.error('Envoi du code de confirmation impossible', { message: err.message });
      // En développement, sans SMTP, le code est journalisé pour pouvoir tester le parcours
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`[DEV] Code de confirmation de ${user.email} : ${code}`);
      }
      return false;
    }
  };

  /**
   * Vérifie le code saisi, confirme l'adresse et OUVRE LA SESSION (jetons émis).
   * Un code faux est compté ; au 5e, le code est invalidé et il faut en redemander un.
   */
  static verifierEmail = async (email, code, meta = {}) => {
    const user = await AuthService.trouverParEmail(email);
    if (!user) throw new BadRequestError('Code incorrect ou expiré.');
    if (user.emailVerifie) {
      // Pas de session ici : sans quoi l'adresse d'un compte confirmé suffirait à s'y connecter
      throw new BadRequestError('Cette adresse est déjà confirmée. Connectez-vous.');
    }

    const otp = await UserOtp.findOne({
      where: { userId: user.id, type: 'verification_email', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otp) {
      throw new BadRequestError("Aucun code en attente. Demandez l'envoi d'un nouveau code.");
    }
    if (otp.expiresAt < new Date()) {
      await otp.update({ isUsed: true });
      throw new BadRequestError('Ce code a expiré. Demandez-en un nouveau.');
    }

    if (!AuthService.empreintesEgales(otp.codeHash, AuthService.sha256(String(code)))) {
      await otp.increment('tentatives');
      await otp.reload({ attributes: ['id', 'tentatives'] });
      if (otp.tentatives >= AuthService.OTP_MAX_TENTATIVES) {
        await otp.update({ isUsed: true });
        throw new BadRequestError('Trop de codes erronés. Demandez un nouveau code.');
      }
      throw new BadRequestError('Code incorrect. Vérifiez les chiffres saisis.');
    }

    // Consommation conditionnelle : un même code ne sert qu'une fois, même en parallèle
    const [consommes] = await UserOtp.update(
      { isUsed: true },
      { where: { id: otp.id, isUsed: false } }
    );
    if (!consommes) throw new BadRequestError('Code incorrect ou expiré.');

    await user.update({ emailVerifie: true, lastLoginAt: new Date() });
    await logActivity({
      userId: user.id,
      action: 'auth.verify_email',
      entite: 'User',
      entiteId: user.id,
      ...meta,
    });
    await sendBienvenueEmail(user).catch(() => {});

    const tokens = await AuthService.issueTokens(user);
    return {
      message: 'Adresse confirmée. Bienvenue chez Yobante Colis !',
      ...tokens,
      utilisateur: user.toSafeJSON(),
    };
  };

  /** Réponse identique que le compte existe ou non (pas d'énumération des adresses). */
  static renvoyerVerification = async (email) => {
    const user = await AuthService.trouverParEmail(email);
    if (user && user.role === 'client' && !user.emailVerifie) {
      await AuthService.envoyerCodeVerification(user);
    }
    return {
      message:
        "Si un compte est en attente de confirmation pour cette adresse, un code vient d'être envoyé.",
    };
  };

  /** Recherche le compte par email ou par téléphone (normalisé au format international). */
  static trouverParIdentifiant = ({ identifiant, email, telephone }) => {
    const valeur = String(identifiant || email || telephone || '').trim();
    if (valeur.includes('@')) return AuthService.trouverParEmail(valeur);
    const numero = parsePhoneNumberFromString(valeur) || parsePhoneNumberFromString(valeur, 'FR');
    const candidats = [valeur];
    if (numero?.isValid()) candidats.unshift(numero.number);
    // Un numéro local sénégalais (77…, 78…) peut être saisi sans indicatif
    const numeroSn = parsePhoneNumberFromString(valeur, 'SN');
    if (numeroSn?.isValid()) candidats.push(numeroSn.number);
    return User.findOne({ where: { telephone: { [Op.in]: [...new Set(candidats)] } } });
  };

  static issueTokens = async (user) => {
    // jti unique : deux connexions du même compte dans la même seconde produisaient
    // des jetons identiques (même sub, même iat), donc le même hash de refresh token
    // et une violation d'unicité (409) — double tap, deux appareils, réessai réseau.
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role, tv: user.tokenVersion ?? 0, jti: crypto.randomUUID() },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expiresIn, algorithm: jwtConfig.algorithm }
    );
    const refreshTokenValue = jwt.sign(
      { sub: user.id, jti: crypto.randomUUID() },
      jwtConfig.refreshSecret,
      {
        expiresIn: jwtConfig.refreshExpiresIn,
        algorithm: jwtConfig.algorithm,
      }
    );
    await RefreshToken.create({
      userId: user.id,
      tokenHash: AuthService.sha256(refreshTokenValue),
      expiresAt: new Date(Date.now() + AuthService.REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken: refreshTokenValue };
  };

  static register = async (data, meta = {}) => {
    // Messages distincts, comme dans SIGNS : l'utilisateur sait quel champ corriger
    if (await AuthService.trouverParEmail(data.email)) {
      throw new ConflictError(
        'Cette adresse email est déjà utilisée. Connectez-vous ou utilisez « Mot de passe oublié ».'
      );
    }
    if (await User.findOne({ where: { telephone: data.telephone } })) {
      throw new ConflictError(
        'Ce numéro de téléphone est déjà associé à un compte Yobante Colis. Connectez-vous avec ce numéro ou utilisez-en un autre.'
      );
    }

    const { codeParrainage: codeParrain, ...donnees } = data;
    let parrainId = null;
    if (codeParrain) {
      const parrain = await User.findOne({
        where: { codeParrainage: codeParrain, role: 'client', isActive: true },
      });
      if (!parrain) throw new BadRequestError('Code de parrainage inconnu');
      parrainId = parrain.id;
    }

    const password = await motDePasse.hacher(data.password);
    let user;
    for (let tentative = 0; !user; tentative += 1) {
      try {
        user = await User.create({
          ...donnees,
          password,
          role: 'client',
          parrainId,
          codeParrainage: genererCodeParrainage(),
          emailVerifie: false,
        });
      } catch (err) {
        // Collision (improbable) sur le code de parrainage : on en tire un autre
        if (err.name !== 'SequelizeUniqueConstraintError' || tentative >= 2) throw err;
      }
    }

    await logActivity({
      userId: user.id,
      action: 'auth.register',
      entite: 'User',
      entiteId: user.id,
      ...meta,
    });
    // Aucun jeton ici : le compte reste fermé jusqu'à la saisie du code reçu par email
    const codeEnvoye = await AuthService.envoyerCodeVerification(user);

    return {
      message: codeEnvoye
        ? `Compte créé. Un code de confirmation vient d'être envoyé à ${user.email}.`
        : "Compte créé, mais l'envoi du code a échoué. Demandez-en un nouveau depuis l'écran de confirmation.",
      verificationRequise: true,
      codeEnvoye,
      email: user.email,
      utilisateur: user.toSafeJSON(),
    };
  };

  static login = async (identifiants, password, meta = {}) => {
    const user = await AuthService.trouverParIdentifiant(
      typeof identifiants === 'string' ? { email: identifiants } : identifiants
    );
    // bcrypt est exécuté même sans compte : le temps de réponse ne révèle pas
    // si l'identifiant existe (énumération des comptes).
    const empreinte = user?.password || (await AuthService.empreinteFactice());
    const valide = await motDePasse.comparer(String(password), empreinte);
    if (!user || !valide) {
      throw new UnauthorizedError('Identifiant ou mot de passe incorrect');
    }
    if (!user.isActive) throw new ForbiddenError('Ce compte a été désactivé', 'COMPTE_DESACTIVE');
    if (user.role === 'client' && !user.emailVerifie) {
      const { verification_email_obligatoire: obligatoire } = await parametreService.chargerTous();
      // Plus de dérogation « SMTP non configuré » : elle laissait entrer des comptes
      // dont l'adresse n'avait jamais été prouvée. Le code d'erreur renvoie
      // l'application vers l'écran de saisie du code.
      if (obligatoire) {
        throw new ForbiddenError(
          "Votre adresse email n'est pas encore confirmée. Saisissez le code reçu par email pour activer votre compte.",
          'EMAIL_NON_CONFIRME',
          { verificationRequise: true, email: user.email }
        );
      }
    }

    const tokens = await AuthService.issueTokens(user);
    await user.update({ lastLoginAt: new Date() });
    await logActivity({
      userId: user.id,
      action: 'auth.login',
      entite: 'User',
      entiteId: user.id,
      ...meta,
    });

    return { message: 'Connexion réussie', ...tokens, utilisateur: user.toSafeJSON() };
  };

  static refreshToken = async (token) => {
    if (!token) throw new UnauthorizedError('Token de rafraîchissement manquant');

    let payload;
    try {
      payload = jwt.verify(token, jwtConfig.refreshSecret, {
        algorithms: [jwtConfig.algorithm],
      });
    } catch (_err) {
      throw new UnauthorizedError('Token de rafraîchissement invalide ou expiré');
    }

    // Consommation atomique : le DELETE ne réussit qu'une fois. Avec une lecture puis
    // une suppression séparées, deux rafraîchissements simultanés du même jeton (deux
    // onglets, réessai réseau) obtenaient chacun une nouvelle paire de jetons.
    const tokenHash = AuthService.sha256(token);
    const consomme = await RefreshToken.destroy({ where: { tokenHash } });
    if (!consomme) throw new UnauthorizedError('Token de rafraîchissement révoqué');

    const user = await User.findByPk(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError('Compte introuvable ou désactivé');

    const tokens = await AuthService.issueTokens(user);
    return { message: 'Token rafraîchi', ...tokens, utilisateur: user.toSafeJSON() };
  };

  static logout = async (refreshTokenValue, accessToken) => {
    if (refreshTokenValue)
      await RefreshToken.destroy({ where: { tokenHash: AuthService.sha256(refreshTokenValue) } });
    if (accessToken) {
      try {
        // Signature vérifiée (expiration ignorée) : seul un jeton authentique est
        // inscrit, la table ne peut pas être remplie de jetons forgés.
        const payload = jwt.verify(accessToken, jwtConfig.secret, {
          algorithms: [jwtConfig.algorithm],
          ignoreExpiration: true,
        });
        if (payload?.exp && payload.exp * 1000 > Date.now()) {
          await TokenBlacklist.create({
            tokenHash: AuthService.sha256(accessToken),
            expiresAt: new Date(payload.exp * 1000),
          });
        }
      } catch (_err) {
        /* token malformé, on ignore */
      }
    }
    return { message: 'Déconnexion réussie' };
  };

  static forgotPassword = async (email) => {
    const user = await AuthService.trouverParEmail(email);
    if (user) await AuthService.createAndSendResetOtp(user); // ne pas révéler l'existence du compte
    return { message: 'Si un compte existe, un email de réinitialisation a été envoyé.' };
  };

  /**
   * Réinitialisation par code à 6 chiffres. Chaque code erroné est compté : au
   * plafond, le code est invalidé et un nouveau doit être demandé. Sans ce
   * compteur, le million de combinaisons restait parcourable pendant la durée
   * de validité du code.
   */
  static resetPassword = async (email, code, newPassword) => {
    const invalide = new BadRequestError('Code de réinitialisation invalide ou expiré');
    const user = await AuthService.trouverParEmail(email);
    if (!user) throw invalide;

    const otp = await UserOtp.findOne({
      where: { userId: user.id, type: 'reset_password', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otp || otp.expiresAt < new Date()) throw invalide;

    if (!AuthService.empreintesEgales(otp.codeHash, AuthService.sha256(String(code)))) {
      // Incrément en SQL (tentatives = tentatives + 1) : des essais simultanés comptent tous
      await otp.increment('tentatives');
      await otp.reload({ attributes: ['id', 'tentatives'] });
      if (otp.tentatives >= AuthService.OTP_MAX_TENTATIVES) await otp.update({ isUsed: true });
      throw invalide;
    }

    // Consommation conditionnelle : un même code ne sert qu'une fois, même en parallèle
    const [consommes] = await UserOtp.update(
      { isUsed: true },
      { where: { id: otp.id, isUsed: false } }
    );
    if (!consommes) throw invalide;

    const password = await motDePasse.hacher(newPassword);
    await user.update({ password });
    await AuthService.revoquerSessions(user);
    return { message: 'Mot de passe réinitialisé avec succès.' };
  };

  static changePassword = async (userId, oldPassword, newPassword) => {
    const user = await User.findByPk(userId);
    if (!(await motDePasse.comparer(oldPassword, user.password))) {
      throw new BadRequestError('Ancien mot de passe incorrect');
    }
    const password = await motDePasse.hacher(newPassword);
    await user.update({ password });
    await AuthService.revoquerSessions(user);
    return { message: 'Mot de passe modifié avec succès.' };
  };
}

module.exports = AuthService;
