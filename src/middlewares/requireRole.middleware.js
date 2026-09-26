const JWTUtils = require('../utils/jwtUtils');
const asyncHandler = require('./asyncHandler');
const { ROLES_ADMIN, ROLES_PERSONNEL } = require('../config/roles');

/**
 * Garde de rôle.
 *
 * Placé après `auth`, il réutilise l'utilisateur déjà vérifié (aucune seconde
 * lecture du jeton ni de la liste de révocation) ; seul, il authentifie aussi.
 * Les rôles autorisés sont exposés sur le middleware (`garde.roles`) : le test
 * de sécurité des routes et la documentation OpenAPI les lisent directement.
 *
 * Usage : router.use(auth, checkActiveUser, admin)
 */
const authorize = (...allowedRoles) => {
  const garde = asyncHandler(async (req, _res, next) => {
    if (!req.user) req.user = await JWTUtils.verifyUserFromHeader(req);
    JWTUtils.assertRoleAllowed(req.user.role, allowedRoles);
    next();
  });
  garde.roles = allowedRoles;
  return garde;
};

const admin = authorize(...ROLES_ADMIN);
const superAdmin = authorize('super_admin');
const coursier = authorize('coursier', ...ROLES_ADMIN);
const agentPoint = authorize('agent_point', ...ROLES_ADMIN);
const personnel = authorize(...ROLES_PERSONNEL);

module.exports = { authorize, admin, superAdmin, coursier, agentPoint, personnel };
