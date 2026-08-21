/**
 * Un formulaire multipart (upload de photos + champs texte) ne transporte que des
 * chaînes : les champs qui représentent des tableaux ou des objets (ex. `pieces`,
 * `articlesDouane`) arrivent donc encodés en JSON. Ce middleware les décode avant
 * que le schéma Joi ne les valide.
 */
const parseJsonFields =
  (...champs) =>
  (req, res, next) => {
    for (const champ of champs) {
      const valeur = req.body?.[champ];
      if (typeof valeur === 'string' && valeur.trim() !== '') {
        try {
          req.body[champ] = JSON.parse(valeur);
        } catch (_err) {
          // Laisse Joi rejeter proprement une valeur qui n'est pas un JSON exploitable
        }
      }
    }
    next();
  };

module.exports = parseJsonFields;
