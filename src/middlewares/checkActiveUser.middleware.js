const { ForbiddenError, UnauthorizedError } = require('../errors/AppError');

/** Refuse un compte désactivé, même porteur d'un jeton encore valide. */
const checkActiveUser = (req, res, next) => {
  if (!req.user) return next(new UnauthorizedError('Utilisateur non authentifié'));
  if (!req.user.isActive) {
    // Code dédié : le client sait qu'il doit fermer la session (un 403 ordinaire
    // signifie seulement « droit manquant pour cette action »)
    return next(new ForbiddenError('Ce compte a été désactivé', 'COMPTE_DESACTIVE'));
  }
  next();
};
checkActiveUser.garde = 'checkActiveUser';

module.exports = checkActiveUser;
