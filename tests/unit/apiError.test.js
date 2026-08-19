const ApiError = require('../../src/utils/ApiError');

describe('ApiError', () => {
  it('badRequest -> 400 avec détails optionnels', () => {
    const err = ApiError.badRequest('Données invalides', ['champ requis']);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Données invalides');
    expect(err.errors).toEqual(['champ requis']);
    expect(err).toBeInstanceOf(Error);
  });

  it('unauthorized -> 401 avec message par défaut', () => {
    const err = ApiError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Non autorisé');
  });

  it('forbidden -> 403 avec message par défaut', () => {
    const err = ApiError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Accès interdit');
  });

  it('notFound -> 404 avec message par défaut', () => {
    const err = ApiError.notFound();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Ressource introuvable');
  });

  it('conflict -> 409 avec message par défaut', () => {
    const err = ApiError.conflict();
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Conflit de données');
  });
});
