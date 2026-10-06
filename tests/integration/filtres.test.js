/**
 * Filtres des listes (paramètres d'URL) : une valeur hors liste, un identifiant ou
 * une date mal formés sont refusés en 400 — jamais une 500 venue de PostgreSQL.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Filtres des listes (base réelle)', () => {
  let app;
  let jetonAdmin;
  let jetonClient;

  beforeAll(async () => {
    app = require('../../src/app');
    jetonAdmin = await f.jeton(await f.creerUtilisateur({ role: 'admin' }));
    const client = await f.creerUtilisateur();
    jetonClient = await f.jeton(client);
    await f.creerColis(client);
  });

  afterAll(fermerBase);

  test.each([
    ['/api/v1/admin/colis?statut=nimporte'],
    ['/api/v1/admin/colis?userId=abc'],
    ['/api/v1/admin/colis?dateDebut=pas-une-date'],
    ['/api/v1/admin/colis?statut=livre&statut=nimporte'],
    ['/api/v1/admin/factures?statut=nimporte'],
    ['/api/v1/admin/enlevements?dateDebut=06-10-2026'],
    ['/api/v1/admin/users?pays=US'],
    ['/api/v1/admin/activity-logs?userId=123'],
  ])('admin %s → 400', async (url) => {
    const res = await request(app).get(url).set('Authorization', jetonAdmin);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Données invalides');
  });

  test('client : statut inconnu → 400', async () => {
    const res = await request(app)
      .get('/api/v1/client/colis?statut=nimporte')
      .set('Authorization', jetonClient);
    expect(res.status).toBe(400);
  });

  test.each([
    ['/api/v1/admin/colis?statut=en_attente_validation&statut=livre&page=1&limit=500'],
    ['/api/v1/admin/colis?statut=&reference=&sortBy=reference&sortOrder=ASC'],
    ['/api/v1/admin/colis?enRetard=true&dateDebut=2026-01-01'],
    ['/api/v1/admin/factures?impayees=false&devise=XOF'],
  ])('filtres valides, vides ou non déclarés : acceptés %s', async (url) => {
    const res = await request(app).get(url).set('Authorization', jetonAdmin);
    expect(res.status).toBe(200);
  });

  test('route sans schéma : identifiant mal formé → 400 du filet de sécurité', async () => {
    const res = await request(app)
      .get('/api/v1/admin/enlevements/tournee/abc')
      .set('Authorization', jetonAdmin);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Paramètre invalide');
  });

  test('client : liste filtrée valide', async () => {
    const res = await request(app)
      .get('/api/v1/client/colis?enCours=true&dateFin=2099-12-31')
      .set('Authorization', jetonClient);
    expect(res.status).toBe(200);
  });
});
