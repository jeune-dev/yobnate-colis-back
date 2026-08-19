const authService = require('../services/auth.service');
const { requestMeta } = require('../services/activityLog.service');
const { cookieConfig } = require('../config/security');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

const REFRESH_COOKIE = 'refreshToken';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const refreshCookieOptions = { ...cookieConfig, maxAge: 7 * 24 * 60 * 60 * 1000 };

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  return created(res, { utilisateur: result.utilisateur }, result.message);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, requestMeta(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return ok(res, {
    accessToken: result.accessToken,
    // Egalement renvoyé dans le corps (en plus du cookie httpOnly) pour les
    // clients mobiles, qui n'ont pas de gestionnaire de cookies et stockent
    // le refresh token eux-mêmes (flutter_secure_storage côté app).
    refreshToken: result.refreshToken,
    expiresIn: EXPIRES_IN,
    utilisateur: result.utilisateur
  }, result.message);
});

const refreshTokenHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const result = await authService.refreshToken(token);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return ok(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: EXPIRES_IN,
    utilisateur: result.utilisateur
  }, result.message);
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const accessToken = req.headers.authorization?.split(' ')[1];
  const result = await authService.logout(refreshToken, accessToken);
  res.clearCookie(REFRESH_COOKIE, cookieConfig);
  return ok(res, null, result.message);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  return ok(res, null, result.message);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword);
  return ok(res, null, result.message);
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
  return ok(res, null, result.message);
});

module.exports = {
  register,
  login,
  refreshToken: refreshTokenHandler,
  logout,
  forgotPassword,
  resetPassword,
  changePassword
};
