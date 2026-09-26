/**
 * Chaque route montée est-elle protégée comme elle doit l'être ?
 *
 * Oublier `auth` ou un garde de rôle sur une ligne de route ne produit aucun
 * symptôme : la route répond, les tests métier passent. Ce test inspecte les
 * routeurs RÉELLEMENT montés (src/modules/index.js), via les étiquettes que
 * portent les middlewares, et exige :
 * - espace client / back-office : authentification + contrôle du compte actif ;
 * - back-office : un garde de rôle sur CHAQUE route ;
 * - aucune route sans authentification hors de la liste nommée ci-dessous.
 *
 * Une route publique ou une lecture ouverte à tout compte est une DÉCISION :
 * elle s'écrit ici, avec sa raison (approche Widjila).
 */
const { ROUTES } = require('../../src/modules');
const { inventorier } = require('../../src/utils/inventaireRoutes');

const routes = inventorier(ROUTES);
const cle = (r) => `${r.methode.toUpperCase()} ${r.chemin}`;

const PUBLIQUES = new Map([
  ['POST /auth/register', 'création de compte'],
  ['POST /auth/login', 'point d’entrée : aucun jeton à présenter encore'],
  ['POST /auth/verify-email', 'confirmation d’email, portée par un jeton secret à usage unique'],
  ['GET /auth/verify-email/:token', 'lien cliqué depuis l’email, même jeton'],
  [
    'POST /auth/resend-verification',
    'renvoi du lien, réponse identique que le compte existe ou non',
  ],
  ['POST /auth/refresh-token', 'le jeton d’accès est justement expiré'],
  ['POST /auth/logout', 'doit aboutir même avec un jeton d’accès expiré'],
  ['POST /auth/forgot-password', 'parcours de secours, par définition sans session'],
  ['POST /auth/reset-password', 'idem, porté par le code reçu par email'],
  ['GET /public/suivi/:reference', 'suivi par numéro, noms masqués'],
  ['GET /public/points-collecte', 'carte publique du réseau'],
  ['GET /public/services', 'catalogue des services'],
  ['GET /public/villes', 'villes desservies'],
  ['POST /public/devis', 'simulation sans compte (cahier des charges)'],
  ['GET /public/desabonnement/:jeton', 'lien de désabonnement, jeton secret'],
  ['GET /public/configuration', 'paramètres publics de l’application'],
  ['GET /public/categories', 'catégories de colis'],
  ['GET /public/accueil', 'contenus de la page d’accueil'],
  ['GET /public/tournees-collecte', 'tournées ouvertes à l’inscription'],
  ['GET /public/tarifs', 'grille tarifaire publique'],
  ['GET /public/emballages', 'catalogue des emballages'],
  ['GET /public/avis', 'avis clients publiés (modérés), noms abrégés (cahier des charges)'],
  ['GET /public/faq', 'FAQ du site vitrine (cahier des charges)'],
  [
    'POST /public/visites',
    'mesure d’audience anonyme (UUID aléatoires, ni IP ni agent), débit limité',
  ],
  ['GET /app-version', 'lu par l’application mobile avant toute connexion'],
  ['POST /suppression-compte', 'exigence Google Play : joignable sans connexion ni application'],
]);

/** Lectures du back-office ouvertes à tout compte connecté, par décision. */
const LECTURES_OUVERTES = new Map([
  ['/admin/services', 'catalogue des services, déjà public via /public/services'],
  ['/admin/tarifs', 'grille tarifaire, déjà publique via /public/tarifs (audit réservé admin)'],
  ['/admin/villes', 'référentiel des villes (dont /publiques) lu par les formulaires'],
  ['/admin/zones', 'zones tarifaires, référentiel non nominatif'],
]);

describe('Inventaire des routes', () => {
  test('l’inventaire couvre toutes les routes montées', () => {
    expect(routes.length).toBeGreaterThan(250);
  });
});

describe('Routes sans authentification : uniquement celles décidées', () => {
  test('aucune route publique non déclarée', () => {
    const publiques = routes.filter((r) => !r.auth).map(cle);
    expect(publiques.filter((c) => !PUBLIQUES.has(c))).toEqual([]);
  });

  test('chaque exception déclarée existe encore (pas de liste périmée)', () => {
    const publiques = new Set(routes.filter((r) => !r.auth).map(cle));
    expect([...PUBLIQUES.keys()].filter((c) => !publiques.has(c))).toEqual([]);
  });
});

describe('Espace client et back-office', () => {
  test.each(routes.filter((r) => r.espace !== 'public').map((r) => [cle(r), r]))(
    '%s exige auth + compte actif',
    (_nom, route) => {
      expect(route.auth).toBe(true);
      expect(route.compteActif).toBe(true);
    }
  );
});

describe('Back-office — garde de rôle sur chaque route', () => {
  test.each(routes.filter((r) => r.espace === 'admin').map((r) => [cle(r), r]))(
    '%s',
    (_nom, route) => {
      const ouverte =
        route.methode === 'get' &&
        [...LECTURES_OUVERTES.keys()].some((prefixe) => route.chemin.startsWith(prefixe));
      if (ouverte) return;
      expect(route.roles).not.toBeNull();
      expect(route.roles).not.toContain('client');
    }
  );

  test('les écritures du référentiel restent réservées aux administrateurs', () => {
    const ecritures = routes.filter(
      (r) =>
        r.methode !== 'get' &&
        [...LECTURES_OUVERTES.keys()].some((prefixe) => r.chemin.startsWith(prefixe))
    );
    expect(ecritures.length).toBeGreaterThan(0);
    for (const r of ecritures) expect(r.roles).toEqual(['admin', 'super_admin']);
  });
});
