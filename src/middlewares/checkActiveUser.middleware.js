const { ForbiddenError } = require('../errors/AppError');

const checkActiveUser = (req, res, next) => {
  if (!req.user.isActive) {
    return next(new ForbiddenError('Ce compte a été désactivé'));
  }
  next();
};

module.exports = checkActiveUser;
