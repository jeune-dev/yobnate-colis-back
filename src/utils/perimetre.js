/**
 * Périmètre du personnel opérationnel (règle de config/roles.js) :
 * - agent_point : ne voit que ce qui transite par SON point de collecte ;
 * - coursier    : ne voit que les colis, enlèvements et encaissements qui lui
 *                 sont affectés ;
 * - admin / super_admin : aucun filtre.
 *
 * Chaque fonction renvoie une clause `where` Sequelize à combiner avec les
 * filtres de la requête, ou `null` quand l'utilisateur n'est pas restreint.
 * Une ressource hors périmètre répond 404, comme une ressource inexistante :
 * son existence n'est pas révélée.
 */
const { Op, literal } = require('sequelize');
const sequelize = require('../config/db');
const { estAdmin } = require('../config/roles');
const { NotFoundError, ForbiddenError } = require('../errors/AppError');

/** Clause impossible : un compte sans rattachement ne voit rien. */
const AUCUN = { id: null };

const restreint = (user) => Boolean(user) && !estAdmin(user.role);

/** Colis rattachés aux demandes d'enlèvement qui vérifient `colonne = valeur`. */
const colisDesEnlevements = (colonne, valeur) => ({
  id: {
    [Op.in]: literal(
      `(SELECT "colisId" FROM demandes_enlevement WHERE "colisId" IS NOT NULL AND "${colonne}" = ${sequelize.escape(valeur)})`
    ),
  },
});

const colis = (user) => {
  if (!restreint(user)) return null;
  // Les colis d'un enlèvement suivent l'enlèvement : coursier qui le ramasse,
  // agent du point où il sera déposé.
  if (user.role === 'agent_point') {
    const p = user.pointCollecteId;
    return p
      ? {
          [Op.or]: [
            { pointCollecteDepartId: p },
            { pointRetraitId: p },
            { pointActuelId: p },
            colisDesEnlevements('pointDepotId', p),
          ],
        }
      : AUCUN;
  }
  if (user.role === 'coursier') {
    return {
      [Op.or]: [
        { coursierEnlevementId: user.id },
        { coursierLivraisonId: user.id },
        colisDesEnlevements('coursierId', user.id),
      ],
    };
  }
  return AUCUN;
};

const paiements = (user) => {
  if (!restreint(user)) return null;
  if (user.role === 'agent_point') {
    return user.pointCollecteId ? { pointCollecteId: user.pointCollecteId } : AUCUN;
  }
  if (user.role === 'coursier') return { recordedBy: user.id };
  return AUCUN;
};

const enlevements = (user) => {
  if (!restreint(user)) return null;
  if (user.role === 'coursier') return { coursierId: user.id };
  if (user.role === 'agent_point') {
    return user.pointCollecteId ? { pointDepotId: user.pointCollecteId } : AUCUN;
  }
  return AUCUN;
};

/** Identifiant stable du périmètre (clé de cache) : « tous » pour un administrateur. */
const cle = (user) =>
  restreint(user) ? `${user.role}:${user.pointCollecteId || user.id}` : 'tous';

/** Combine les filtres de la requête et la restriction de périmètre. */
const combiner = (where, restriction) => (restriction ? { [Op.and]: [where, restriction] } : where);

/** Vérifie qu'une ressource désignée par son identifiant est dans le périmètre. */
const assertDansPerimetre = async (Model, id, restriction, message) => {
  if (!restriction) return;
  const visible = await Model.count({ where: { [Op.and]: [{ id }, restriction] } });
  if (!visible) throw new NotFoundError(message);
};

/**
 * Middleware de route : `:id` doit désigner une ressource du périmètre de
 * l'utilisateur (sans effet pour un administrateur).
 */
const exigerPerimetre = (Model, calculer, message) => async (req, res, next) => {
  try {
    await assertDansPerimetre(Model, req.params.id, calculer(req.user), message);
    next();
  } catch (err) {
    next(err);
  }
};

/** Un agent n'opère que sur son propre point (caisse, stock, statistiques). */
const assertPoint = (user, pointId) => {
  if (!restreint(user)) return;
  if (user.role !== 'agent_point' || user.pointCollecteId !== pointId) {
    throw new ForbiddenError("Ce point de collecte n'est pas dans votre périmètre");
  }
};

module.exports = {
  colis,
  paiements,
  enlevements,
  combiner,
  assertDansPerimetre,
  exigerPerimetre,
  assertPoint,
  restreint,
  cle,
};
