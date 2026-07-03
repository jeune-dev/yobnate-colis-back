const ApiError = require('../utils/ApiError');

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return next(ApiError.forbidden('Vous n\'avez pas les permissions requises'));
  }
  next();
};

const admin = authorize('admin', 'super_admin');
const superAdmin = authorize('super_admin');

module.exports = { authorize, admin, superAdmin };
