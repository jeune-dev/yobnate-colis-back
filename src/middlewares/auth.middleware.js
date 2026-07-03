const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config/security');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const auth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Token d\'authentification manquant');
  }

  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret);
  } catch (err) {
    throw ApiError.unauthorized('Token invalide ou expiré');
  }

  const user = await User.findByPk(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('Utilisateur introuvable');
  }

  req.user = user;
  next();
});

module.exports = auth;
