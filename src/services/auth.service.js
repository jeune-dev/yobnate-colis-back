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
const { sendOtpEmail, sendBienvenueEmail } = require('../utils/mailer');
const { logActivity } = require('./activityLog.service');

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

    const password = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
    const user = await User.create({ ...data, password, role: 'client' });

    await logActivity({
      userId: user.id,
      action: 'auth.register',
      entite: 'User',
      entiteId: user.id,
      ...meta,
    });
    await sendBienvenueEmail(user).catch(() => {});

    return {
      message: 'Compte créé avec succès. Vous pouvez vous connecter.',
      utilisateur: user.toSafeJSON(),
    };
  };

  static login = async (email, password, meta = {}) => {
    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Email ou mot de passe incorrect');
    }
    if (!user.isActive) throw new ForbiddenError('Ce compte a été désactivé');

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
