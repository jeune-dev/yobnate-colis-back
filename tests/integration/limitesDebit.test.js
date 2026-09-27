/**
 * Limitation de débit, telle qu'elle s'applique en production (NODE_ENV=production) :
 * de nombreux utilisateurs partagent une même IP (NAT des opérateurs mobiles,
 * bureau du back-office) sans se bloquer entre eux, et la protection anti force
 * brute reste entière.
 */
const request = require('supertest');
const { describeDb, fermerBase } = require('../helpers/db');
const f = require('../helpers/fabrique');

describeDb('Limitation de débit (règles de production)', () => {
  let app;
  const environnement = process.env.NODE_ENV;
  // Chaque test a sa propre IP : les compteurs (store mémoire) ne se mélangent pas
  let ip = 10;
  const nouvelleIp = () => `198.51.100.${(ip += 1)}`;

  beforeAll(() => {
    app = require('../../src/app');
    process.env.NODE_ENV = 'production';
  });
  afterAll(async () => {
    process.env.NODE_ENV = environnement;
    await fermerBase();
  });

  const connexion = (adresse, identifiant, password = f.MOT_DE_PASSE) =>
    request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', adresse)
      .send({ identifiant, password });

  test('les consultations du suivi public ne consomment pas le quota de connexion', async () => {
    const adresse = nouvelleIp();
    const client = await f.creerUtilisateur();
    for (let i = 0; i < 12; i += 1) {
      await request(app).get('/public/suivi/YB0000000001').set('X-Forwarded-For', adresse);
    }
    expect((await connexion(adresse, client.email)).status).toBe(200);
  });

  test('les connexions réussies derrière une même IP ne sont pas limitées', async () => {
    const adresse = nouvelleIp();
    const clients = await Promise.all(Array.from({ length: 12 }, () => f.creerUtilisateur()));
    const statuts = [];
    for (const client of clients) statuts.push((await connexion(adresse, client.email)).status);
    expect(statuts).toEqual(clients.map(() => 200));
  });

  test('force brute : les échecs sur un compte sont plafonnés, même avec le bon mot de passe ensuite', async () => {
    const adresse = nouvelleIp();
    const client = await f.creerUtilisateur();
    for (let i = 0; i < 10; i += 1) {
      expect((await connexion(adresse, client.email, 'Mauvais1!')).status).toBe(401);
    }
    expect((await connexion(adresse, client.email)).status).toBe(429);
    // Un autre compte depuis la même IP reste utilisable
    const autre = await f.creerUtilisateur();
    expect((await connexion(adresse, autre.email)).status).toBe(200);
  });

  test('le plafond global compte par compte connecté, pas par IP partagée', async () => {
    const limiteur = require('../../src/middlewares/rateLimit.middleware').globalRateLimit;
    const adresse = nouvelleIp();
    const [a, b] = await Promise.all([f.creerUtilisateur(), f.creerUtilisateur()]);
    const [jetonA, jetonB] = await Promise.all([f.jeton(a), f.jeton(b)]);
    const lire = (jeton) =>
      request(app)
        .get('/client/notifications/non-lues')
        .set('X-Forwarded-For', adresse)
        .set('Authorization', jeton);
    const r = await lire(jetonA);
    expect(r.status).toBe(200);
    const restantA = Number(r.headers['ratelimit-remaining']);
    const rb = await lire(jetonB);
    // Deux budgets distincts : B n'a rien consommé du quota de A
    expect(Number(rb.headers['ratelimit-remaining'])).toBe(restantA);
    expect(typeof limiteur).toBe('function');
  });
});
