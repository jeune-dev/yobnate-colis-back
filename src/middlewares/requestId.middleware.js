const { randomUUID } = require('crypto');

/**
 * Identifiant de corrélation : repris de l'en-tête X-Request-ID posé par le
 * proxy (s'il est sûr) ou généré, renvoyé dans la réponse et dans chaque log et
 * chaque erreur, pour relier un signalement client à ses traces serveur.
 */
const FORMAT_SUR = /^[A-Za-z0-9._-]{8,100}$/;

const requestId = (req, res, next) => {
  const recu = req.headers['x-request-id'];
  req.requestId = typeof recu === 'string' && FORMAT_SUR.test(recu) ? recu : randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

module.exports = requestId;
