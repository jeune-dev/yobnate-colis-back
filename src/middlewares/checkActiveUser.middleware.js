const ApiError = require('../utils/ApiError');

const checkActiveUser = (req, res, next) => {
  if (!req.user.isActive) {
    return next(ApiError.forbidden('Ce compte a été désactivé'));
  }
  next();
};

module.exports = checkActiveUser;
