/** Version de l'application mobile (repris de Sign). */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Version de l’application mobile (base réelle)', () => {
  let app;
  let jetonAdmin;

  beforeAll(async () => {
    app = require('../../src/app');
    jetonAdmin = await f.jeton(await f.creerUtilisateur({ role: 'admin' }));
  });
  afterAll(fermerBase);

  const creer = (champs) =>
    request(app)
      .post('/admin/app-version')
      .set('Authorization', jetonAdmin)
      .send({
        plateforme: 'ios',
        derniereVersion: '2.1.0',
        versionMinimale: '2.0.0',
        lienStore: 'https://apps.apple.com/app/id000',
        ...champs,
      });

  test('lecture publique de la configuration active, sans jeton', async () => {
    await creer({ derniereVersion: '2.3.0', versionMinimale: '2.1.0' }).expect(201);
    const res = await request(app).get('/app-version').query({ plateforme: 'ios' });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toMatchObject({
      derniereVersion: '2.3.0',
      versionMinimale: '2.1.0',
    });
  });

  test('une nouvelle configuration active désactive la précédente', async () => {
    await creer({
      plateforme: 'android',
      derniereVersion: '1.0.0',
      versionMinimale: '1.0.0',
    }).expect(201);
    await creer({
      plateforme: 'android',
      derniereVersion: '1.1.0',
      versionMinimale: '1.0.0',
    }).expect(201);
    expect(
      await f.models.AppVersion.count({ where: { plateforme: 'android', isActive: true } })
    ).toBe(1);
    const res = await request(app).get('/api/v1/app-version').query({ plateforme: 'android' });
    expect(res.body.data.version.derniereVersion).toBe('1.1.0');
  });

  test('version minimale supérieure à la dernière → 400, rien n’est créé', async () => {
    const avant = await f.models.AppVersion.count();
    const res = await creer({ derniereVersion: '1.0.0', versionMinimale: '1.2.0' });
    expect(res.status).toBe(400);
    expect(await f.models.AppVersion.count()).toBe(avant);
  });

  test('format de version invalide → 400', async () => {
    expect((await creer({ derniereVersion: 'v2' })).status).toBe(400);
  });

  test('plateforme inconnue en lecture publique → 400', async () => {
    expect((await request(app).get('/app-version').query({ plateforme: 'windows' })).status).toBe(
      400
    );
  });

  test('un client ne peut pas modifier la configuration → 403', async () => {
    const client = await f.creerUtilisateur();
    const res = await request(app)
      .post('/admin/app-version')
      .set('Authorization', await f.jeton(client))
      .send({});
    expect(res.status).toBe(403);
  });
});
