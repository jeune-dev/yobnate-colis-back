const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, UserOtp, RefreshToken, TokenBlacklist } = require('../models');
const { jwtConfig, bcryptConfig } = require('../config/security');
const {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} = require('../errors/AppError');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const {
  sendOtpEmail,
  sendBienvenueEmail,
  envoyerModele,
  smtpConfigure,
  URL_PUBLIQUE,
} = require('../utils/mailer');
const { genererCodeParrainage } = require('../utils/referenceGenerator');
const { logActivity } = require('./activityLog.service');
const parametreService = require('./parametre.service');

class AuthService {
  static OTP_TTL_MS = 10 * 60 * 1000;
  static REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  static sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
  static generateOtpCode = () => String(crypto.randomInt(100000, 1000000));

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

  static VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Lien de confirmation de l'adresse email. Le jeton n'est stocké qu'haché ;
   * le lien pointe vers l'API (API_PUBLIC_URL) ou, à défaut, vers l'application
   * qui transmet le jeton à POST /auth/verify-email.
   */
  static envoyerLienVerification = async (user) => {
    const token = crypto.randomBytes(32).toString('hex');
    await UserOtp.update(
      { isUsed: true },
      { where: { userId: user.id, type: 'verification_email', isUsed: false } }
    );
    await UserOtp.create({
      userId: user.id,
      codeHash: AuthService.sha256(token),
      type: 'verification_email',
      expiresAt: new Date(Date.now() + AuthService.VERIFICATION_TTL_MS),
    });
    const baseApi = process.env.API_PUBLIC_URL;
    const lien = baseApi
      ? `${baseApi}/auth/verify-email/${token}`
      : `${URL_PUBLIQUE}/verifier-email?token=${token}`;
    await envoyerModele('verification_email', user.email, { prenom: user.prenom, lien });
  };

  static verifierEmail = async (token) => {
    const otp = await UserOtp.findOne({
      where: { codeHash: AuthService.sha256(String(token)), type: 'verification_email' },
    });
    if (!otp || otp.isUsed || otp.expiresAt < new Date()) {
      throw new BadRequestError('Lien de confirmation invalide ou expiré');
    }
    const user = await User.findByPk(otp.userId);
    if (!user) throw new BadRequestError('Lien de confirmation invalide ou expiré');
    await otp.update({ isUsed: true });
    await user.update({ emailVerifie: true });
    await logActivity({
      userId: user.id,
      action: 'auth.verify_email',
      entite: 'User',
      entiteId: user.id,
    });
    await sendBienvenueEmail(user).catch(() => {});
    return { message: 'Adresse email confirmée. Vous pouvez vous connecter.' };
  };

  static renvoyerVerification = async (email) => {
    const user = await User.findOne({ where: { email } });
    if (user && !user.emailVerifie) await AuthService.envoyerLienVerification(user);
    return { message: 'Si un compte non confirmé existe, un nouveau lien a été envoyé.' };
  };

  /** Recherche le compte par email ou par téléphone (normalisé au format international). */
  static trouverParIdentifiant = ({ identifiant, email, telephone }) => {
    const valeur = String(identifiant || email || telephone || '').trim();
    if (valeur.includes('@')) {
      return User.findOne({
        where: User.sequelize.where(
          User.sequelize.fn('lower', User.sequelize.col('email')),
          valeur.toLowerCase()
        ),
      });
    }
    const numero = parsePhoneNumberFromString(valeur) || parsePhoneNumberFromString(valeur, 'FR');
    const candidats = [valeur];
    if (numero?.isValid()) candidats.unshift(numero.number);
    // Un numéro local sénégalais (77…, 78…) peut être saisi sans indicatif
    const numeroSn = parsePhoneNumberFromString(valeur, 'SN');
    if (numeroSn?.isValid()) candidats.push(numeroSn.number);
    return User.findOne({ where: { telephone: { [Op.in]: [...new Set(candidats)] } } });
  };

  static issueTokens = async (user) => {
    const accessToken = jwt.sign({ sub: user.id, role: user.role }, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn,
    });
    const refreshTokenValue = jwt.sign({ sub: user.id }, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshExpiresIn,
    });
    await RefreshToken.create({
      userId: user.id,
      tokenHash: AuthService.sha256(refreshTokenValue),
      expiresAt: new Date(Date.now() + AuthService.REFRESH_TTL_MS),
    });
    return { accessToken, refreshToken: refreshTokenValue };
  };

  static register = async (data, meta = {}) => {
    const existing = await User.findOne({
      where: { [Op.or]: [{ email: data.email }, { telephone: data.telephone }] },
    });
    if (existing) {
      throw new ConflictError('Un compte existe déjà avec cet email ou ce numéro de téléphone');
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

    const password = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
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
    await AuthService.envoyerLienVerification(user).catch(() => {});

    return {
      message:
        'Compte créé. Un lien de confirmation vous a été envoyé par email : cliquez dessus pour activer votre compte.',
      utilisateur: user.toSafeJSON(),
    };
  };

  static login = async (identifiants, password, meta = {}) => {
    const user = await AuthService.trouverParIdentifiant(
      typeof identifiants === 'string' ? { email: identifiants } : identifiants
    );
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Identifiant ou mot de passe incorrect');
    }
    if (!user.isActive) throw new ForbiddenError('Ce compte a été désactivé');
    if (user.role === 'client' && !user.emailVerifie) {
      const { verification_email_obligatoire: obligatoire } = await parametreService.chargerTous();
      // Sans SMTP configuré, le lien ne peut pas être reçu : la vérification ne bloque pas
      if (obligatoire && smtpConfigure()) {
        throw new ForbiddenError(
          'Adresse email non confirmée : cliquez sur le lien reçu par email (ou demandez-en un nouveau).'
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
      payload = jwt.verify(token, jwtConfig.refreshSecret);
    } catch (_err) {
      throw new UnauthorizedError('Token de rafraîchissement invalide ou expiré');
    }

    const tokenHash = AuthService.sha256(token);
    const stored = await RefreshToken.findOne({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedError('Token de rafraîchissement révoqué');

    const user = await User.findByPk(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedError('Compte introuvable ou désactivé');

    await stored.destroy();
    const tokens = await AuthService.issueTokens(user);
    return { message: 'Token rafraîchi', ...tokens, utilisateur: user.toSafeJSON() };
  };

  static logout = async (refreshTokenValue, accessToken) => {
    if (refreshTokenValue)
      await RefreshToken.destroy({ where: { tokenHash: AuthService.sha256(refreshTokenValue) } });
    if (accessToken) {
      try {
        const payload = jwt.decode(accessToken);
        if (payload?.exp) {
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
    const user = await User.findOne({ where: { email } });
    if (user) await AuthService.createAndSendResetOtp(user); // ne pas révéler l'existence du compte
    return { message: 'Si un compte existe, un email de réinitialisation a été envoyé.' };
  };

  static resetPassword = async (email, code, newPassword) => {
    const user = await User.findOne({ where: { email } });
    if (!user) throw new BadRequestError('Code de réinitialisation invalide ou expiré');

    const otp = await UserOtp.findOne({
      where: { userId: user.id, type: 'reset_password', isUsed: false },
      order: [['createdAt', 'DESC']],
    });
    if (!otp || otp.expiresAt < new Date() || otp.codeHash !== AuthService.sha256(code)) {
      throw new BadRequestError('Code de réinitialisation invalide ou expiré');
    }

    const password = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
    await otp.update({ isUsed: true });
    await user.update({ password });
    await RefreshToken.destroy({ where: { userId: user.id } });
    return { message: 'Mot de passe réinitialisé avec succès.' };
  };

  static changePassword = async (userId, oldPassword, newPassword) => {
    const user = await User.findByPk(userId);
    if (!(await bcrypt.compare(oldPassword, user.password))) {
      throw new BadRequestError('Ancien mot de passe incorrect');
    }
    const password = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
    await user.update({ password });
    await RefreshToken.destroy({ where: { userId: user.id } });
    return { message: 'Mot de passe modifié avec succès.' };
  };
}

module.exports = AuthService;
