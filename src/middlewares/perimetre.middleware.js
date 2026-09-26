/**
 * Adaptateur pour `router.param('id', …)` : le contrôle de périmètre n'est
 * exécuté que sur un identifiant bien formé. Un identifiant invalide passe
 * sans requête et sera rejeté en 400 par la validation de la route.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const siUuid = (controle) => (req, res, next, valeur) =>
  UUID.test(String(valeur)) ? controle(req, res, next) : next();

module.exports = { siUuid };
