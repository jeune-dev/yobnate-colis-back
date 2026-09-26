const JWTUtils = require('../utils/jwtUtils');

/**
 * Identification FACULTATIVE sur une route publique : si un jeton valide est
 * présenté, `req.user` est renseigné (simulation ou visite rattachée au compte),
 * sinon la requête continue anonymement. Un jeton invalide ou expiré n'est pas une
 * erreur ici : la route reste publique (et déclarée comme telle dans
 * tests/security/routes.gardes.test.js).
 *
 * Volontairement sans étiquette `garde` : l'inventaire des routes ne doit pas la
 * confondre avec l'authentification obligatoire.
 */
const authOptionnelle = async (req, _res, next) => {
  if (!String(req.headers.authorization || '').startsWith('Bearer ')) return next();
  try {
    req.user = await JWTUtils.verifyUserFromHeader(req);
  } catch (_err) {
    req.user = undefined;
  }
  return next();
};

module.exports = authOptionnelle;
