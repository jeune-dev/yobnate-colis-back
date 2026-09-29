const checkActiveUser = require('../../src/middlewares/checkActiveUser.middleware');
const { ForbiddenError } = require('../../src/errors/AppError');

describe('compte désactivé', () => {
  it('checkActiveUser renvoie un 403 avec le code COMPTE_DESACTIVE', () => {
    const next = jest.fn();
    checkActiveUser({ user: { id: 'u1', isActive: false } }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403, code: 'COMPTE_DESACTIVE' });
  });

  it('laisse passer un compte actif', () => {
    const next = jest.fn();
    checkActiveUser({ user: { id: 'u1', isActive: true } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('un 403 ordinaire ne porte pas de code', () => {
    expect(new ForbiddenError('Accès refusé').code).toBeUndefined();
  });

  it('le gestionnaire d’erreurs transmet le code au client', () => {
    const errorHandler = require('../../src/middlewares/errorHandler.middleware');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), headersSent: false };
    const req = { method: 'GET', originalUrl: '/x', body: {}, id: 'r1', headers: {} };
    errorHandler(
      new ForbiddenError('Ce compte a été désactivé', 'COMPTE_DESACTIVE'),
      req,
      res,
      () => {}
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'COMPTE_DESACTIVE' });
  });
});
