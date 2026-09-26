/**
 * Compte les requêtes SQL et mesure la durée de chaque endpoint critique.
 *
 * À lancer UNIQUEMENT sur une base de mesure alimentée par scripts/perf/seed.sql :
 *   PERF_DATABASE_URL=postgres://… node scripts/perf/requetes-par-endpoint.js
 * Affiche un tableau JSON : endpoint, statut HTTP, nb de requêtes SQL, durée (ms),
 * taille de la réponse et nb de lignes rapatriées par la plus grosse requête.
 */
process.env.DATABASE_URL = process.env.PERF_DATABASE_URL;
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = 'error';
if (!process.env.DATABASE_URL) throw new Error('PERF_DATABASE_URL requis');

const request = require('supertest');
const m = require('../../src/models');
const app = require('../../src/app');

let requetes = [];
m.sequelize.options.logging = (sql, ms) => requetes.push({ sql, ms });
m.sequelize.options.benchmark = true;

const PASSWORD = 'Perf_Test_1234!';

const mesurer = async (nom, req) => {
  requetes = [];
  const t0 = process.hrtime.bigint();
  const r = await req;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    endpoint: nom,
    statut: r.status,
    requetesSql: requetes.length,
    dureeMs: Math.round(ms),
    sqlMs: requetes.reduce((a, q) => a + q.ms, 0),
    octets: Number(r.headers['content-length'] || JSON.stringify(r.body).length),
  };
};

(async () => {
  const cache = require('../../src/config/cache');
  const admin = await m.User.findOne({ where: { role: 'super_admin' } });
  const [[client]] = await m.sequelize.query(
    `SELECT u.email, u.id FROM users u JOIN colis c ON c."userId" = u.id
      WHERE u.role = 'client' GROUP BY u.id ORDER BY count(*) DESC LIMIT 1`
  );
  const login = async (email) =>
    (await request(app).post('/auth/login').send({ identifiant: email, password: PASSWORD })).body
      .data?.accessToken;
  const jetonAdmin = await login(admin.email);
  const jetonClient = await login(client.email);
  if (!jetonAdmin || !jetonClient) throw new Error('Connexion impossible (seed ?)');
  const colis = await m.Colis.findOne({
    where: { userId: client.id },
    order: [['createdAt', 'DESC']],
  });
  const A = { Authorization: `Bearer ${jetonAdmin}` };
  const C = { Authorization: `Bearer ${jetonClient}` };
  const get = (url, h) =>
    request(app)
      .get(url)
      .set(h || {});

  const resultats = [];
  const vider = () => cache.del && ['dashboard:stats', 'dashboard:pays'].forEach(cache.del);
  const cas = [
    [
      'POST /auth/login',
      () =>
        request(app).post('/auth/login').send({ identifiant: client.email, password: PASSWORD }),
    ],
    ['GET /client/colis', () => get('/client/colis', C)],
    ['GET /client/colis?page=50', () => get('/client/colis?page=50', C)],
    ['GET /client/colis/recus', () => get('/client/colis/recus', C)],
    ['GET /client/colis/:id', () => get(`/client/colis/${colis.id}`, C)],
    ['GET /client/colis/:id/suivi', () => get(`/client/colis/${colis.id}/suivi`, C)],
    ['GET /client/notifications', () => get('/client/notifications', C)],
    ['GET /client/notifications/non-lues', () => get('/client/notifications/non-lues', C)],
    ['GET /public/suivi/:ref', () => get(`/public/suivi/${colis.reference}`)],
    ['GET /admin/colis', () => get('/admin/colis', A)],
    ['GET /admin/colis?page=5000', () => get('/admin/colis?page=5000', A)],
    ['GET /admin/colis?reference=0001', () => get('/admin/colis?reference=0001', A)],
    ['GET /admin/colis/:id', () => get(`/admin/colis/${colis.id}`, A)],
    [
      'GET /admin/colis/recherche/:num',
      () => get(`/admin/colis/recherche/${colis.reference}-1`, A),
    ],
    ['GET /admin/colis/statistiques', () => get('/admin/colis/statistiques', A)],
    ['GET /admin/dashboard/stats (froid)', () => (vider(), get('/admin/dashboard/stats', A))],
    ['GET /admin/dashboard/kpis', () => get('/admin/dashboard/kpis?dateDebut=2000-01-01', A)],
    ['GET /admin/dashboard/par-pays (froid)', () => (vider(), get('/admin/dashboard/par-pays', A))],
    [
      'GET /admin/dashboard/utilisateurs-actifs',
      () => get('/admin/dashboard/utilisateurs-actifs', A),
    ],
    ['GET /admin/dashboard/villes-depart', () => get('/admin/dashboard/villes-depart', A)],
    ['GET /admin/dashboard/points-attention', () => get('/admin/dashboard/points-attention', A)],
    ['GET /admin/dashboard/activites', () => get('/admin/dashboard/activites', A)],
    ['GET /admin/users', () => get('/admin/users', A)],
    ['GET /admin/factures', () => get('/admin/factures', A)],
    ['GET /admin/activity-logs', () => get('/admin/activity-logs', A)],
  ];
  for (const [nom, fn] of cas) {
    await fn(); // chauffe (plans, caches internes Sequelize)
    resultats.push(await mesurer(nom, fn()));
  }
  console.table(resultats);
  if (process.env.PERF_JSON)
    require('fs').writeFileSync(process.env.PERF_JSON, JSON.stringify(resultats, null, 2));
  await m.sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
