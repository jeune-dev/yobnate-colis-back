/**
 * Identifiant anonyme du visiteur, transmis par le site ou l'application dans
 * l'en-tête `X-Visiteur-Id` (UUID aléatoire conservé côté client). Il relie une
 * simulation faite sans compte à la commande passée ensuite. Toute valeur qui
 * n'est pas un UUID est ignorée.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const lireVisiteurId = (req) => {
  const valeur = String(req.headers['x-visiteur-id'] || '').trim();
  return UUID.test(valeur) ? valeur.toLowerCase() : null;
};

module.exports = { lireVisiteurId };
