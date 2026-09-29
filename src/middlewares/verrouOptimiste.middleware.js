'use strict';
const { BadRequestError, ConflictError } = require('../errors/AppError');

/**
 * Verrou optimiste : empêche d'écraser en silence une modification faite entre-temps.
 *
 * Le client renvoie dans l'en-tête `X-Version` la valeur `updatedAt` de la donnée
 * telle qu'il l'a affichée. Si l'enregistrement a changé depuis (autre utilisateur,
 * autre onglet, traitement automatique), la requête est refusée en 409 au lieu de
 * remplacer la version récente par une version périmée.
 *
 * L'en-tête est facultatif : sans lui, le comportement historique (dernière écriture
 * gagnante) est conservé, pour ne pas casser les clients existants (applications mobiles).
 *
 * @param {import('sequelize').ModelStatic<any>} Model modèle dont la ligne est mise à jour
 * @param {{ param?: string, cle?: string }} [options] paramètre d'URL et colonne de recherche
 */
const verrouOptimiste = (Model, { param = 'id', cle = 'id' } = {}) => {
  const garde = async (req, res, next) => {
    try {
      const attendue = req.get('X-Version');
      if (!attendue) return next();

      const horodatage = new Date(attendue);
      if (Number.isNaN(horodatage.getTime())) {
        throw new BadRequestError('En-tête X-Version invalide (date ISO attendue)');
      }

      const ligne = await Model.findOne({
        where: { [cle]: req.params[param] },
        attributes: [cle, 'updatedAt'],
      });
      // Ligne absente : le service répondra lui-même 404
      if (!ligne) return next();

      if (new Date(ligne.updatedAt).getTime() !== horodatage.getTime()) {
        throw new ConflictError(
          "Cette donnée a été modifiée par quelqu'un d'autre depuis son ouverture. " +
            'Rechargez la page pour voir la dernière version, puis refaites votre modification.'
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
  garde.garde = 'verrouOptimiste';
  return garde;
};

module.exports = verrouOptimiste;
