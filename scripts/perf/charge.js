/**
 * Test de charge d'une instance de l'API (autocannon).
 *
 *   node scripts/perf/charge.js <url> <pid du serveur> <fichier de sortie JSON>
 *
 * Prérequis : base alimentée par scripts/perf/seed.sql (mot de passe Perf_Test_1234!)
 * et `npm i -g autocannon` (ou AUTOCANNON_PATH). Mesure, pour chaque scénario et
 * chaque niveau de concurrence : débit, latences p50/p95/p99, erreurs, et pendant
 * l'essai le CPU et la mémoire du serveur ainsi que les connexions PostgreSQL actives.
 */
/* eslint-disable no-console */
const { execSync } = require('child_process');
const autocannon = require(process.env.AUTOCANNON_PATH || 'autocannon');

const [url, pid, sortie] = process.argv.slice(2);
const DUREE = Number(process.env.DUREE_S) || 10;
const NIVEAUX = (process.env.NIVEAUX || '10,50,100').split(',').map(Number);
const PSQL = process.env.PSQL_CMD || ''; // ex. psql -h 127.0.0.1 -U yob ma_base
const BASE = process.env.PERF_BASE || '';

const appel = async (chemin, options = {}) => {
  const r = await fetch(url + chemin, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return r.json();
};

/** Temps CPU cumulé du processus (utime + stime, en ticks) lu dans /proc. */
const tempsCpu = () => {
  const champs = require('fs').readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return Number(champs[11]) + Number(champs[12]);
};
const TICKS = 100; // CLK_TCK usuel sous Linux

const echantillonner = () => {
  const mesures = [];
  let precedent = { cpu: tempsCpu(), t: Date.now() };
  const minuteur = setInterval(() => {
    try {
      const courant = { cpu: tempsCpu(), t: Date.now() };
      // % d'un cœur sur l'intervalle (et non la moyenne depuis le démarrage de ps)
      const cpu =
        ((courant.cpu - precedent.cpu) / TICKS / ((courant.t - precedent.t) / 1000)) * 100;
      precedent = courant;
      const rss = execSync(`ps -o rss= -p ${pid}`).toString().trim();
      const connexions = PSQL
        ? Number(
            execSync(
              `${PSQL} -Atc "select count(*) from pg_stat_activity where datname = '${BASE}' and pid <> pg_backend_pid()"`
            )
              .toString()
              .trim()
          )
        : null;
      mesures.push({ cpu, rssMo: Number(rss) / 1024, connexions });
    } catch (_e) {
      /* serveur arrêté */
    }
  }, 500);
  return () => {
    clearInterval(minuteur);
    const max = (k) => Math.max(...mesures.map((m) => m[k] ?? 0));
    const moy = (k) => mesures.reduce((a, m) => a + (m[k] ?? 0), 0) / (mesures.length || 1);
    return {
      cpuMoyen: Math.round(moy('cpu')),
      rssMaxMo: Math.round(max('rssMo')),
      connexionsPgMax: PSQL ? max('connexions') : null,
    };
  };
};

(async () => {
  const connexion = (email) =>
    appel('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifiant: email, password: 'Perf_Test_1234!' }),
    }).then((r) => r.data.accessToken);
  const admin = await connexion('client1@perf.test'); // super_admin dans le seed (1 à 5)
  // { clientEmail, colisId (colis « lourd » du seed), colisEcritureId (colis en transit) }
  const env = JSON.parse(process.env.PERF_CIBLES);
  const client = await connexion(env.clientEmail);
  const A = { Authorization: `Bearer ${admin}` };
  const C = { Authorization: `Bearer ${client}` };

  const scenarios = [
    { nom: 'GET /health', path: '/health' },
    { nom: 'GET /client/colis (liste)', path: '/client/colis', headers: C },
    { nom: 'GET /client/colis/:id (détail)', path: `/client/colis/${env.colisId}`, headers: C },
    { nom: 'GET /admin/colis/:id (relations)', path: `/admin/colis/${env.colisId}`, headers: A },
    {
      nom: 'GET /admin/colis?reference= (recherche)',
      path: '/admin/colis?reference=00123',
      headers: A,
    },
    { nom: 'GET /admin/colis (liste admin)', path: '/admin/colis', headers: A },
    { nom: 'GET /admin/dashboard/stats', path: '/admin/dashboard/stats', headers: A },
    { nom: 'GET /client/colis/recus', path: '/client/colis/recus', headers: C },
    {
      nom: 'POST /admin/colis/:id/evenements (écriture)',
      path: `/admin/colis/${env.colisEcritureId}/evenements`,
      method: 'POST',
      headers: { ...A, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeEvenement: 'INFO', commentaire: 'charge' }),
    },
    {
      nom: 'POST /auth/login (bcrypt 12)',
      path: '/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiant: env.clientEmail, password: 'Perf_Test_1234!' }),
      niveaux: [10],
    },
  ];

  const resultats = [];
  const filtre = process.env.SCENARIO; // exécuter un seul scénario (serveur neuf à chaque fois)
  for (const sc of scenarios.filter((x) => !filtre || x.nom === filtre)) {
    for (const connexions of sc.niveaux || NIVEAUX) {
      const arreter = echantillonner();
      const r = await autocannon({
        url: url + sc.path,
        method: sc.method || 'GET',
        headers: sc.headers,
        body: sc.body,
        connections: connexions,
        duration: DUREE,
        timeout: 30,
      });
      const systeme = arreter();
      const ligne = {
        scenario: sc.nom,
        connexions,
        rps: Math.round(r.requests.average),
        // autocannon fournit p90 et p97,5 (pas de p95 exact)
        p50: r.latency.p50,
        p90: r.latency.p90,
        p97_5: r.latency.p97_5,
        p99: r.latency.p99,
        moyenne: Math.round(r.latency.average),
        erreurs: r.errors + r.timeouts + (r.non2xx || 0),
        requetes: r.requests.total,
        ...systeme,
      };
      console.log(JSON.stringify(ligne));
      resultats.push(ligne);
    }
  }
  const precedents = require('fs').existsSync(sortie)
    ? JSON.parse(require('fs').readFileSync(sortie, 'utf8'))
    : [];
  require('fs').writeFileSync(sortie, JSON.stringify([...precedents, ...resultats], null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
