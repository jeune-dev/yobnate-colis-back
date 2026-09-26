const { ForbiddenError, UnauthorizedError } = require('../errors/AppError');

/** Refuse un compte désactivé, même porteur d'un jeton encore valide. */
const checkActiveUser = (req, res, next) => {
  if (!req.user) return next(new UnauthorizedError('Utilisateur non authentifié'));
  if (!req.user.isActive) {
    return next(new ForbiddenError('Ce compte a été désactivé'));
  }
  next();
};
checkActiveUser.garde = 'checkActiveUser';

module.exports = checkActiveUser;
