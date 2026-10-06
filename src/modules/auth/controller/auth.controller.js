const authService = require('../service/auth.service');
const { requestMeta } = require('../../activityLog/service/activityLog.service');
const { cookieConfig } = require('../../../config/security');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

const REFRESH_COOKIE = 'refreshToken';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const refreshCookieOptions = { ...cookieConfig, maxAge: 7 * 24 * 60 * 60 * 1000 };

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  // Pas de jeton : l'application enchaîne sur la saisie du code reçu par email
  return created(
    res,
    {
      verificationRequise: true,
      codeEnvoye: result.codeEnvoye,
      email: result.email,
      utilisateur: result.utilisateur,
    },
    result.message
  );
});

exports.login = asyncHandler(async (req, res) => {
  const { identifiant, email, telephone, password } = req.body;
  const result = await authService.login(
    { identifiant, email, telephone },
    password,
    requestMeta(req)
  );
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return ok(
    res,
    {
      accessToken: result.accessToken,
      // Egalement renvoyé dans le corps (en plus du cookie httpOnly) pour les
      // clients mobiles, qui n'ont pas de gestionnaire de cookies et stockent
      // le refresh token eux-mêmes (flutter_secure_storage côté app).
      refreshToken: result.refreshToken,
      expiresIn: EXPIRES_IN,
      utilisateur: result.utilisateur,
    },
    result.message
  );
});

exports.refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const result = await authService.refreshToken(token);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return ok(
    res,
    {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: EXPIRES_IN,
      utilisateur: result.utilisateur,
    },
    result.message
  );
});

exports.logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const accessToken = req.headers.authorization?.split(' ')[1];
  const result = await authService.logout(refreshToken, accessToken);
  res.clearCookie(REFRESH_COOKIE, cookieConfig);
  return ok(res, null, result.message);
});

/**
 * Confirme l'adresse avec le code reçu et ouvre la session : c'est ici que les
 * jetons sont émis pour la première fois, comme à la connexion.
 */
exports.verifierEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifierEmail(req.body.email, req.body.code, requestMeta(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return ok(
    res,
    {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: EXPIRES_IN,
      utilisateur: result.utilisateur,
    },
    result.message
  );
});

exports.renvoyerVerification = asyncHandler(async (req, res) => {
  const result = await authService.renvoyerVerification(req.body.email);
  return ok(res, null, result.message);
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  return ok(res, null, result.message);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(
    req.body.email,
    req.body.code,
    req.body.newPassword
  );
  return ok(res, null, result.message);
});

exports.changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.user.id,
    req.body.oldPassword,
    req.body.newPassword
  );
  return ok(res, null, result.message);
});
