const JWTUtils = require('../utils/jwtUtils');
const asyncHandler = require('../utils/asyncHandler');

const authorize = (...allowedRoles) =>
  asyncHandler(async (req, _res, next) => {
    req.user = await JWTUtils.verifyUserFromHeader(req, allowedRoles);
    next();
  });

const admin = authorize('admin', 'super_admin');
const superAdmin = authorize('super_admin');
const coursier = authorize('coursier', 'admin', 'super_admin');
const agentPoint = authorize('agent_point', 'admin', 'super_admin');
const personnel = authorize('coursier', 'agent_point', 'admin', 'super_admin');

module.exports = { authorize, admin, superAdmin, coursier, agentPoint, personnel };
