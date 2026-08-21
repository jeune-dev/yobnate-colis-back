const JWTUtils = require('../utils/jwtUtils');
const asyncHandler = require('../utils/asyncHandler');

const auth = asyncHandler(async (req, _res, next) => {
  req.user = await JWTUtils.verifyUserFromHeader(req);
  next();
});

module.exports = auth;
