const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, UserOtp, RefreshToken } = require('../models');
const { jwtConfig, bcryptConfig } = require('../config/security');
const ApiError = require('../utils/ApiError');
const { sendOtpEmail } = require('../utils/mailer');
const { logActivity } = require('./activityLog.service');

const OTP_TTL_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const generateOtpCode = () => String(crypto.randomInt(100000, 1000000));

const createAndSendResetOtp = async (user) => {
  const code = generateOtpCode();
  await UserOtp.create({
    userId: user.id,
    codeHash: sha256(code),
    type: 'reset_password',
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });
  await sendOtpEmail(user, code);
};

const issueTokens = async (user) => {
  const accessToken = jwt.sign({ sub: user.id, role: user.role }, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn
  });
  const refreshToken = jwt.sign({ sub: user.id }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn
  });
  await RefreshToken.create({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
  });
  return { accessToken, refreshToken };
};

const register = async (data, meta = {}) => {
  const existing = await User.findOne({ where: { [Op.or]: [{ email: data.email }, { telephone: data.telephone }] } });
  if (existing) {
    throw ApiError.conflict('Un compte existe déjà avec cet email ou ce numéro de téléphone');
  }

  const password = await bcrypt.hash(data.password, bcryptConfig.saltRounds);
  const user = await User.create({ ...data, password, role: 'client' });

  await logActivity({ userId: user.id, action: 'auth.register', entite: 'User', entiteId: user.id, ...meta });

  return { message: 'Compte créé avec succès. Vous pouvez vous connecter.', utilisateur: user.toSafeJSON() };
};

const login = async (email, password, meta = {}) => {
  const user = await User.findOne({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw ApiError.unauthorized('Email ou mot de passe incorrect');
  }
  if (!user.isActive) throw ApiError.forbidden('Ce compte a été désactivé');

  const tokens = await issueTokens(user);
  await user.update({ lastLoginAt: new Date() });
  await logActivity({ userId: user.id, action: 'auth.login', entite: 'User', entiteId: user.id, ...meta });

  return { message: 'Connexion réussie', ...tokens, utilisateur: user.toSafeJSON() };
};

const refreshToken = async (token) => {
  if (!token) throw ApiError.unauthorized('Token de rafraîchissement manquant');

  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.refreshSecret);
  } catch (err) {
    throw ApiError.unauthorized('Token de rafraîchissement invalide ou expiré');
  }

  const tokenHash = sha256(token);
  const stored = await RefreshToken.findOne({ where: { tokenHash } });
  if (!stored) throw ApiError.unauthorized('Token de rafraîchissement révoqué');

  const user = await User.findByPk(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Compte introuvable ou désactivé');

  await stored.destroy();
  const tokens = await issueTokens(user);
  return { message: 'Token rafraîchi', ...tokens, utilisateur: user.toSafeJSON() };
};

const logout = async (token) => {
  if (token) await RefreshToken.destroy({ where: { tokenHash: sha256(token) } });
  return { message: 'Déconnexion réussie' };
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ where: { email } });
  if (user) await createAndSendResetOtp(user); // ne pas révéler l'existence du compte
  return { message: 'Si un compte existe, un email de réinitialisation a été envoyé.' };
};

const resetPassword = async (email, code, newPassword) => {
  const user = await User.findOne({ where: { email } });
  if (!user) throw ApiError.badRequest('Code de réinitialisation invalide ou expiré');

  const otp = await UserOtp.findOne({
    where: { userId: user.id, type: 'reset_password', isUsed: false },
    order: [['createdAt', 'DESC']]
  });
  if (!otp || otp.expiresAt < new Date() || otp.codeHash !== sha256(code)) {
    throw ApiError.badRequest('Code de réinitialisation invalide ou expiré');
  }

  const password = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
  await otp.update({ isUsed: true });
  await user.update({ password });
  await RefreshToken.destroy({ where: { userId: user.id } });
  return { message: 'Mot de passe réinitialisé avec succès.' };
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findByPk(userId);
  if (!(await bcrypt.compare(oldPassword, user.password))) {
    throw ApiError.badRequest('Ancien mot de passe incorrect');
  }
  const password = await bcrypt.hash(newPassword, bcryptConfig.saltRounds);
  await user.update({ password });
  await RefreshToken.destroy({ where: { userId: user.id } });
  return { message: 'Mot de passe modifié avec succès.' };
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword
};
