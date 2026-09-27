/* eslint-disable no-console -- script en ligne de commande : la sortie standard est son interface */
/**
 * Test de charge par profil d'utilisation (base de mesure uniquement).
 *
 *   node scripts/perf/charge-profils.js <profil> <connexions> <durée s> <pid du serveur> [port]
 *
 * Profils : client (écrans de l'application mobile), admin (listes et tableau de
 * bord), public (site vitrine : avis, FAQ, suivi, mesure d'audience).
 * Prérequis : base alimentée par scripts/perf/seed.sql puis seed-mesures.sql,
 * PERF_DATABASE_URL, JWT_SECRET identique à celui du serveur, et autocannon
 * (`npm i -g autocannon` ou AUTOCANNON_PATH). Chaque requête porte une IP
 * différente (X-Forwarded-For) comme des utilisateurs réels.
 *
 * Écrit une ligne JSON : débit, latences (autocannon donne p50, p90, p97,5 et
 * p99, pas de p95), codes HTTP, et pendant l'essai : CPU du serveur (processus et
 * sous-processus), CPU de PostgreSQL, mémoire, connexions PostgreSQL.
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const autocannon = require(process.env.AUTOCANNON_PATH || 'autocannon');

const [profil, connexions, duree, pid, port = '3100'] = process.argv.slice(2);
const URL_API = `http://127.0.0.1:${port}`;
const BASE = new URL(process.env.PERF_DATABASE_URL).pathname.slice(1);

const lireCpu = (p) => {
  const champs = fs.readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ');
  return Number(champs[11]) + Number(champs[12]);
};
const enfants = (p) =>
  execSync(`pgrep -P ${p} || true`).toString().trim().split('\n').filter(Boolean);
const pidsServeur = () => [pid, ...enfants(pid)];
const somme = (pids, mesure) =>
  pids.reduce((total, p) => {
    try {
      return total + mesure(p);
    } catch (_err) {
      return total;
    }
  }, 0);
const pidsPostgres = () =>
  execSync(`pgrep -f "postgres: .*${BASE}" || true`).toString().trim().split('\n').filter(Boolean);
const psql = (sql) =>
  execSync(`psql "${process.env.PERF_DATABASE_URL}" -Atc "${sql}"`).toString().trim();

const echantillonner = () => {
  const mesures = [];
  let precedent = {
    node: somme(pidsServeur(), lireCpu),
    pg: somme(pidsPostgres(), lireCpu),
    t: Date.now(),
  };
  const minuteur = setInterval(() => {
    const courant = {
      node: somme(pidsServeur(), lireCpu),
      pg: somme(pidsPostgres(), lireCpu),
      t: Date.now(),
    };
    const secondes = (courant.t - precedent.t) / 1000;
    const rss =
      somme(pidsServeur(), (p) => Number(execSync(`ps -o rss= -p ${p}`).toString().trim())) / 1024;
    const [actives, total] = psql(
      `select count(*) filter (where state <> 'idle'), count(*) from pg_stat_activity where datname = '${BASE}'`
    )
      .split('|')
      .map(Number);
    // CLK_TCK = 100 sous Linux : pourcentage d'un cœur sur l'intervalle
    mesures.push({
      node: (courant.node - precedent.node) / secondes,
      pg: (courant.pg - precedent.pg) / secondes,
      rss,
      actives,
      total,
    });
    precedent = courant;
  }, 500);
  return () => {
    clearInterval(minuteur);
    const max = (k) => Math.round(Math.max(...mesures.map((m) => m[k])));
    const moy = (k) => Math.round(mesures.reduce((a, m) => a + m[k], 0) / (mesures.length || 1));
    return {
      cpuNodeMoy: moy('node'),
      cpuPgMoy: moy('pg'),
      rssMaxMo: max('rss'),
      pgConnexionsMax: max('total'),
      pgActivesMax: max('actives'),
    };
  };
};

const jetons = async () => {
  const c = new Client({ connectionString: process.env.PERF_DATABASE_URL });
  await c.connect();
  const { rows: clients } = await c.query(
    `SELECT u.id, (SELECT c.id FROM colis c WHERE c."userId" = u.id ORDER BY c."createdAt" DESC LIMIT 1) AS colis
       FROM users u WHERE role = 'client' ORDER BY email LIMIT 500`
  );
  const { rows: admins } = await c.query(`SELECT id FROM users WHERE role = 'super_admin'`);
  await c.end();
  const signer = (id, role) =>
    jwt.sign({ sub: id, role, tv: 0, jti: crypto.randomUUID() }, process.env.JWT_SECRET, {
      expiresIn: '2h',
      algorithm: 'HS256',
    });
  return {
    clients: clients.filter((u) => u.colis).map((u) => ({ ...u, jeton: signer(u.id, 'client') })),
    admins: admins.map((u) => ({ ...u, jeton: signer(u.id, 'super_admin') })),
  };
};

const bearer = (u) => ({ authorization: `Bearer ${u.jeton}` });
const visite = (plateforme, u) => ({
  method: 'POST',
  path: '/api/v1/public/visites',
  headers: { 'content-type': 'application/json', ...(u ? bearer(u) : {}) },
  body: JSON.stringify({
    sessionId: crypto.randomUUID(),
    visiteurId: crypto.randomUUID(),
    plateforme,
    evenement: 'page',
    page: '/accueil',
  }),
});

/** [poids, (client, admin) => requête] */
const PROFILS = {
  client: [
    [30, (u) => ({ path: '/api/v1/client/colis', headers: bearer(u) })],
    [20, (u) => ({ path: `/api/v1/client/colis/${u.colis}`, headers: bearer(u) })],
    [10, (u) => ({ path: `/api/v1/client/colis/${u.colis}/suivi`, headers: bearer(u) })],
    [15, (u) => ({ path: '/api/v1/client/notifications/non-lues', headers: bearer(u) })],
    [15, (u) => visite('android', u)],
    [5, () => ({ path: '/api/v1/public/configuration' })],
    [5, () => ({ path: '/api/v1/public/accueil?pays=FR' })],
  ],
  admin: [
    [25, (u, a) => ({ path: '/api/v1/admin/colis', headers: bearer(a) })],
    [15, (u, a) => ({ path: `/api/v1/admin/colis/${u.colis}`, headers: bearer(a) })],
    [15, (u, a) => ({ path: '/api/v1/admin/dashboard/stats', headers: bearer(a) })],
    [10, (u, a) => ({ path: '/api/v1/admin/factures', headers: bearer(a) })],
    [10, (u, a) => ({ path: '/api/v1/admin/paiements', headers: bearer(a) })],
    [10, (u, a) => ({ path: '/api/v1/admin/users', headers: bearer(a) })],
    [
      15,
      (u, a) => ({
        path: `/api/v1/admin/colis?reference=${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
        headers: bearer(a),
      }),
    ],
  ],
  public: [
    [40, () => visite('web')],
    [30, () => ({ path: '/api/v1/public/avis' })],
    [15, () => ({ path: '/api/v1/public/faq' })],
    [
      15,
      () => ({
        path: `/api/v1/public/suivi/YB${String(1 + Math.floor(Math.random() * 199999)).padStart(10, '0')}`,
      }),
    ],
  ],
};

(async () => {
  const table = PROFILS[profil];
  if (!table) throw new Error(`Profil inconnu : ${profil}`);
  const { clients, admins } = await jetons();
  const alea = (liste) => liste[Math.floor(Math.random() * liste.length)];
  const poidsTotal = table.reduce((a, [p]) => a + p, 0);
  const tirer = () => {
    let r = Math.random() * poidsTotal;
    for (const [poids, fabrique] of table) if ((r -= poids) < 0) return fabrique;
    return table[0][1];
  };
  const octet = () => Math.floor(Math.random() * 250);

  const arreter = echantillonner();
  const res = await autocannon({
    url: URL_API,
    connections: Number(connexions),
    duration: Number(duree),
    timeout: 30,
    requests: [
      {
        setupRequest: (req) => {
          const r = { ...req, method: 'GET', ...tirer()(alea(clients), alea(admins)) };
          r.headers = {
            ...(r.headers || {}),
            'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}`,
          };
          return r;
        },
      },
    ],
  });
  const systeme = arreter();
  console.log(
    JSON.stringify({
      profil,
      connexions: Number(connexions),
      rps: Math.round(res.requests.average),
      p50: res.latency.p50,
      p90: res.latency.p90,
      p97_5: res.latency.p97_5,
      p99: res.latency.p99,
      max: res.latency.max,
      erreurs: res.errors + res.timeouts,
      non2xx: res.non2xx,
      total: res.requests.total,
      ...systeme,
    })
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
