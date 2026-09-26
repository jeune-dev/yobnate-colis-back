const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const paginate = ({ page, limit } = {}) => {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return { limit: perPage, offset: (currentPage - 1) * perPage };
};

const paginateResult = (count, page, limit) => {
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const perPage = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  return {
    totalItems: count,
    totalPages: Math.ceil(count / perPage),
    currentPage,
    pageSize: perPage,
  };
};

module.exports = { paginate, paginateResult };

/**
 * Liste paginée optimisée, pour les tables volumineuses (colis…) dont les includes
 * sont de simples relations « N-1 » facultatives (client, villes, service…).
 *
 * `findAndCountAll` avec ces includes exécutait :
 *   - un COUNT(DISTINCT id) joint à toutes les tables liées, sur toute la table ;
 *   - un SELECT des lignes complètes jointes, dont PostgreSQL devait construire
 *     `offset + limit` lignes avant d'en jeter `offset`.
 * Ici : un COUNT(*) sans jointure, puis les seuls identifiants de la page (parcours
 * d'index), puis les lignes complètes de ces seuls identifiants. Le résultat
 * (`{ rows, count }`) et l'ordre sont identiques ; l'identifiant sert de départage
 * pour que deux pages successives ne se recouvrent jamais.
 *
 * Contrat : `where` et `order` ne portent que sur les colonnes du modèle principal,
 * et aucun include n'est `required`.
 */
const listerPagine = async (Model, { where = {}, include = [], order = [], limit, offset }) => {
  const pk = Model.primaryKeyAttribute;
  const ordre = [...order, [pk, order[0]?.[1] || 'DESC']];

  const count = await Model.count({ where });
  if (!count || offset >= count) return { count, rows: [] };

  const ids = (
    await Model.findAll({ where, attributes: [pk], order: ordre, limit, offset, raw: true })
  ).map((ligne) => ligne[pk]);
  const rows = await Model.findAll({ where: { [pk]: ids }, include, order: ordre });
  return { count, rows };
};

module.exports.listerPagine = listerPagine;
