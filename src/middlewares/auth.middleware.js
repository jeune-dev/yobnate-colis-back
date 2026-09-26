const JWTUtils = require('../utils/jwtUtils');
const asyncHandler = require('./asyncHandler');

/**
 * Authentification par jeton Bearer : signature, révocation, version du jeton
 * et existence du compte (voir utils/jwtUtils.js).
 */
const auth = asyncHandler(async (req, _res, next) => {
  req.user = await JWTUtils.verifyUserFromHeader(req);
  next();
});
auth.garde = 'auth';

module.exports = auth;
