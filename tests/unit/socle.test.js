/**
 * Briques transverses sans base : périmètre du personnel, traduction des
 * erreurs, documentation générée, planification des tâches.
 */
const { Op } = require('sequelize');
const perimetre = require('../../src/utils/perimetre');
const errorHandler = require('../../src/middlewares/errorHandler.middleware');
const { AppError, NotFoundError } = require('../../src/errors/AppError');

describe('Périmètre du personnel', () => {
  test('administrateur : aucune restriction', () => {
    expect(perimetre.colis({ role: 'admin' })).toBeNull();
    expect(perimetre.paiements({ role: 'super_admin' })).toBeNull();
  });

  test('agent : colis de son point (départ, retrait ou présence)', () => {
    const where = perimetre.colis({ role: 'agent_point', pointCollecteId: 'p1' });
    expect(where[Op.or]).toEqual([
      { pointCollecteDepartId: 'p1' },
      { pointRetraitId: 'p1' },
      { pointActuelId: 'p1' },
    ]);
  });

  test('agent sans point rattaché : ne voit rien', () => {
    expect(perimetre.colis({ role: 'agent_point', pointCollecteId: null })).toEqual({ id: null });
    expect(perimetre.paiements({ role: 'agent_point' })).toEqual({ id: null });
  });

  test('coursier : ses affectations uniquement', () => {
    expect(perimetre.enlevements({ role: 'coursier', id: 'c1' })).toEqual({ coursierId: 'c1' });
    expect(perimetre.paiements({ role: 'coursier', id: 'c1' })).toEqual({ recordedBy: 'c1' });
  });

  test('un client égaré dans le back-office ne voit rien', () => {
    expect(perimetre.colis({ role: 'client', id: 'u' })).toEqual({ id: null });
  });

  test('combiner : filtres ET restriction', () => {
    expect(perimetre.combiner({ a: 1 }, null)).toEqual({ a: 1 });
    expect(perimetre.combiner({ a: 1 }, { b: 2 })).toEqual({ [Op.and]: [{ a: 1 }, { b: 2 }] });
  });

  test('assertPoint : un coursier n’a pas de caisse', () => {
    expect(() => perimetre.assertPoint({ role: 'coursier', id: 'c' }, 'p1')).toThrow(/périmètre/);
    expect(() =>
      perimetre.assertPoint({ role: 'agent_point', pointCollecteId: 'p1' }, 'p1')
    ).not.toThrow();
  });
});

describe('Gestionnaire d’erreurs', () => {
  const executer = (err, env = 'test') => {
    const avant = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, { method: 'GET', originalUrl: '/x', requestId: 'rid', body: {} }, res);
    process.env.NODE_ENV = avant;
    return { statut: res.status.mock.calls[0][0], corps: res.json.mock.calls[0][0] };
  };

  test('erreur métier : son statut et son message', () => {
    expect(executer(new NotFoundError('Colis introuvable'))).toEqual({
      statut: 404,
      corps: { success: false, message: 'Colis introuvable', requestId: 'rid' },
    });
  });

  test.each([
    ['SequelizeUniqueConstraintError', 409],
    ['SequelizeForeignKeyConstraintError', 400],
    ['SequelizeConnectionRefusedError', 503],
    ['TokenExpiredError', 401],
  ])('%s → %i', (nom, statut) => {
    const err = new Error('détail interne');
    err.name = nom;
    expect(executer(err).statut).toBe(statut);
  });

  test('erreur inattendue en production : message interne masqué', () => {
    const { statut, corps } = executer(
      new Error('SELECT * FROM users — mot de passe DB'),
      'production'
    );
    expect(statut).toBe(500);
    expect(corps.message).toBe('Erreur interne du serveur');
    expect(JSON.stringify(corps)).not.toContain('SELECT');
  });

  test('erreur non opérationnelle marquée comme telle : jamais son message en production', () => {
    const err = new AppError('secret interne', 500, false);
    expect(executer(err, 'production').corps.message).toBe('Erreur interne du serveur');
  });
});

describe('Documentation OpenAPI générée', () => {
  const { ROUTES } = require('../../src/modules');
  const { inventorier } = require('../../src/utils/inventaireRoutes');
  const { genererOpenApi } = require('../../src/config/openapi');
  const spec = genererOpenApi(ROUTES);

  test('chaque route montée est documentée', () => {
    const manquantes = inventorier(ROUTES).filter((r) => {
      const chemin = r.chemin.replace(/:(\w+)/g, '{$1}');
      return !spec.paths[chemin]?.[r.methode];
    });
    expect(manquantes.map((r) => `${r.methode} ${r.chemin}`)).toEqual([]);
  });

  test('une route protégée déclare le jeton et ses rôles', () => {
    const op = spec.paths['/admin/factures/{id}'].get;
    expect(op.security).toEqual([{ bearerAuth: [] }]);
    expect(op.description).toMatch(/Administrateur/);
  });

  test('le corps attendu est celui du schéma Joi réel', () => {
    const corps =
      spec.paths['/auth/reset-password'].post.requestBody.content['application/json'].schema;
    expect(corps.required).toEqual(expect.arrayContaining(['email', 'code', 'newPassword']));
  });
});

describe('Tâches planifiées', () => {
  const { estLeader } = require('../../src/jobs');
  afterEach(() => delete process.env.NODE_APP_INSTANCE);

  test('processus seul (conteneur) : exécute les tâches', () => {
    expect(estLeader()).toBe(true);
  });

  test('cluster PM2 : seule l’instance 0 les exécute', () => {
    process.env.NODE_APP_INSTANCE = '0';
    expect(estLeader()).toBe(true);
    process.env.NODE_APP_INSTANCE = '2';
    expect(estLeader()).toBe(false);
  });
});
