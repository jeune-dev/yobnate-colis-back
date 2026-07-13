const authService = require('../services/auth.service');
const { requestMeta } = require('../services/activityLog.service');
const { cookieConfig, jwtConfig } = require('../config/security');
const asyncHandler = require('../utils/asyncHandler');

const REFRESH_COOKIE = 'refreshToken';
const refreshCookieOptions = { ...cookieConfig, maxAge: 7 * 24 * 60 * 60 * 1000 };

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  res.status(201).json({ success: true, message: result.message, data: { utilisateur: result.utilisateur } });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, requestMeta(req));
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  res.status(200).json({
    success: true,
    message: result.message,
    data: { accessToken: result.accessToken, expiresIn: jwtConfig.expiresIn, utilisateur: result.utilisateur }
  });
});

const refreshTokenHandler = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const result = await authService.refreshToken(token);
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  res.status(200).json({
    success: true,
    message: result.message,
    data: { accessToken: result.accessToken, expiresIn: jwtConfig.expiresIn, utilisateur: result.utilisateur }
  });
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body.refreshToken;
  const accessToken = req.headers.authorization?.split(' ')[1];
  const result = await authService.logout(refreshToken, accessToken);
  res.clearCookie(REFRESH_COOKIE, cookieConfig);
  res.status(200).json({ success: true, message: result.message, data: null });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  res.status(200).json({ success: true, message: result.message, data: null });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword);
  res.status(200).json({ success: true, message: result.message, data: null });
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
  res.status(200).json({ success: true, message: result.message, data: null });
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
