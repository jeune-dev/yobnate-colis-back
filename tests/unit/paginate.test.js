const { paginate, paginateResult } = require('../../src/utils/paginate');

describe('paginate', () => {
  it('applique les valeurs par défaut quand rien n\'est fourni', () => {
    expect(paginate({})).toEqual({ limit: 20, offset: 0 });
  });

  it('calcule le bon offset selon la page', () => {
    expect(paginate({ page: 3, limit: 10 })).toEqual({ limit: 10, offset: 20 });
  });

  it('plafonne la limite à MAX_LIMIT (100)', () => {
    expect(paginate({ page: 1, limit: 500 })).toEqual({ limit: 100, offset: 0 });
  });

  it('ramène une page négative ou nulle à 1', () => {
    expect(paginate({ page: -5, limit: 10 })).toEqual({ limit: 10, offset: 0 });
    expect(paginate({ page: 0, limit: 10 })).toEqual({ limit: 10, offset: 0 });
  });

  it('ignore les valeurs non numériques', () => {
    expect(paginate({ page: 'abc', limit: 'xyz' })).toEqual({ limit: 20, offset: 0 });
  });
});

describe('paginateResult', () => {
  it('calcule le nombre total de pages par arrondi supérieur', () => {
    expect(paginateResult(45, 1, 20)).toEqual({
      totalItems: 45,
      totalPages: 3,
      currentPage: 1,
      pageSize: 20
    });
  });

  it('gère un total de zéro élément', () => {
    expect(paginateResult(0, 1, 20)).toEqual({
      totalItems: 0,
      totalPages: 0,
      currentPage: 1,
      pageSize: 20
    });
  });
});
