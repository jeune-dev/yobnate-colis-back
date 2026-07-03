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
    pageSize: perPage
  };
};

module.exports = { paginate, paginateResult };
