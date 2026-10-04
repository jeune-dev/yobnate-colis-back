/**
 * Table des routes de l'API : SOURCE UNIQUE du montage (app.js), du test de
 * sécurité des routes (tests/security) et de la documentation OpenAPI générée.
 *
 * `espace` classe chaque routeur :
 * - public : aucune authentification (chaque route doit s'y justifier) ;
 * - client : compte connecté, ses propres ressources uniquement ;
 * - admin  : back-office, garde de rôle obligatoire sur chaque route.
 */
const r = (module, fichier) => require(`./${module}/route/${fichier}.route`);

const ROUTES = [
  // ── Public ───────────────────────────────────────────────────────────────
  { chemin: '/auth', espace: 'public', tag: 'Authentification', routeur: r('auth', 'auth') },
  { chemin: '/public', espace: 'public', tag: 'Public', routeur: r('public', 'public') },
  {
    chemin: '/app-version',
    espace: 'public',
    tag: 'Version application',
    routeur: r('appVersion', 'appVersion'),
  },
  {
    chemin: '/public/demandes-contact',
    espace: 'public',
    tag: 'Contact des sites vitrines',
    routeur: r('demandeContact', 'demandeContactPublic'),
  },
  {
    chemin: '/suppression-compte',
    espace: 'public',
    tag: 'Suppression de compte',
    routeur: r('compte', 'suppressionCompte'),
  },

  // ── Espace client ────────────────────────────────────────────────────────
  {
    chemin: '/client/colis',
    espace: 'client',
    tag: 'Client — Colis',
    routeur: r('colis', 'colisClient'),
  },
  {
    chemin: '/client/profil',
    espace: 'client',
    tag: 'Client — Profil',
    routeur: r('profil', 'profil'),
  },
  {
    chemin: '/client/compte',
    espace: 'client',
    tag: 'Client — Compte',
    routeur: r('compte', 'compte'),
  },
  {
    chemin: '/client/notifications',
    espace: 'client',
    tag: 'Client — Notifications',
    routeur: r('notification', 'notification'),
  },
  {
    chemin: '/client/paiements',
    espace: 'client',
    tag: 'Client — Paiements',
    routeur: r('paiement', 'paiementClient'),
  },
  {
    chemin: '/client/enlevements',
    espace: 'client',
    tag: 'Client — Enlèvements',
    routeur: r('enlevement', 'enlevementClient'),
  },
  {
    chemin: '/client/adresses',
    espace: 'client',
    tag: 'Client — Adresses',
    routeur: r('adresse', 'adresse'),
  },
  {
    chemin: '/client/avis',
    espace: 'client',
    tag: 'Client — Avis',
    routeur: r('avis', 'avisClient'),
  },
  {
    chemin: '/client/reclamations',
    espace: 'client',
    tag: 'Client — Réclamations',
    routeur: r('reclamation', 'reclamationClient'),
  },

  // ── Back-office ──────────────────────────────────────────────────────────
  {
    chemin: '/admin/dashboard',
    espace: 'admin',
    tag: 'Admin — Tableau de bord',
    routeur: r('dashboard', 'dashboard'),
  },
  { chemin: '/admin/users', espace: 'admin', tag: 'Admin — Clients', routeur: r('admin', 'user') },
  {
    chemin: '/admin/personnel',
    espace: 'admin',
    tag: 'Admin — Personnel',
    routeur: r('admin', 'personnel'),
  },
  {
    chemin: '/admin/admins',
    espace: 'admin',
    tag: 'Admin — Administrateurs',
    routeur: r('admin', 'admin'),
  },
  {
    chemin: '/admin/parrainage',
    espace: 'admin',
    tag: 'Admin — Parrainage',
    routeur: r('admin', 'parrainage'),
  },
  {
    chemin: '/admin/colis',
    espace: 'admin',
    tag: 'Admin — Colis',
    routeur: r('colis', 'colisAdmin'),
  },
  { chemin: '/admin/villes', espace: 'admin', tag: 'Admin — Villes', routeur: r('ville', 'ville') },
  { chemin: '/admin/zones', espace: 'admin', tag: 'Admin — Zones', routeur: r('zone', 'zone') },
  {
    chemin: '/admin/points-collecte',
    espace: 'admin',
    tag: 'Admin — Points de collecte',
    routeur: r('pointCollecte', 'pointCollecte'),
  },
  {
    chemin: '/admin/services',
    espace: 'admin',
    tag: 'Admin — Services',
    routeur: r('tarification', 'serviceExpedition'),
  },
  {
    chemin: '/admin/tarifs',
    espace: 'admin',
    tag: 'Admin — Tarifs',
    routeur: r('tarification', 'tarif'),
  },
  {
    chemin: '/admin/surcharges',
    espace: 'admin',
    tag: 'Admin — Surcharges',
    routeur: r('tarification', 'surcharge'),
  },
  {
    chemin: '/admin/jours-feries',
    espace: 'admin',
    tag: 'Admin — Jours fériés',
    routeur: r('jourFerie', 'jourFerie'),
  },
  {
    chemin: '/admin/rotations',
    espace: 'admin',
    tag: 'Admin — Rotations',
    routeur: r('rotation', 'rotation'),
  },
  // Alias métier : une rotation maritime est un conteneur
  {
    chemin: '/admin/conteneurs',
    espace: 'admin',
    tag: 'Admin — Rotations',
    routeur: r('rotation', 'rotation'),
    alias: true,
  },
  {
    chemin: '/admin/enlevements',
    espace: 'admin',
    tag: 'Admin — Enlèvements',
    routeur: r('enlevement', 'enlevementAdmin'),
  },
  {
    chemin: '/admin/douane',
    espace: 'admin',
    tag: 'Admin — Douane',
    routeur: r('douane', 'douane'),
  },
  {
    chemin: '/admin/reclamations',
    espace: 'admin',
    tag: 'Admin — Réclamations',
    routeur: r('reclamation', 'reclamationAdmin'),
  },
  {
    chemin: '/admin/factures',
    espace: 'admin',
    tag: 'Admin — Factures',
    routeur: r('facture', 'facture'),
  },
  {
    chemin: '/admin/paiements',
    espace: 'admin',
    tag: 'Admin — Paiements',
    routeur: r('paiement', 'paiementAdmin'),
  },
  {
    chemin: '/admin/parametres',
    espace: 'admin',
    tag: 'Admin — Paramètres',
    routeur: r('parametre', 'parametre'),
  },
  {
    chemin: '/admin/activity-logs',
    espace: 'admin',
    tag: 'Admin — Journal',
    routeur: r('activityLog', 'activityLog'),
  },
  {
    chemin: '/admin/articles-tarif',
    espace: 'admin',
    tag: 'Admin — Catalogue',
    routeur: r('catalogue', 'articleTarif'),
  },
  {
    chemin: '/admin/emballages',
    espace: 'admin',
    tag: 'Admin — Catalogue',
    routeur: r('catalogue', 'emballage'),
  },
  {
    chemin: '/admin/tournees-collecte',
    espace: 'admin',
    tag: 'Admin — Tournées de collecte',
    routeur: r('catalogue', 'tourneeCollecte'),
  },
  {
    chemin: '/admin/annonces',
    espace: 'admin',
    tag: 'Admin — Catalogue',
    routeur: r('catalogue', 'annonce'),
  },
  {
    chemin: '/admin/modeles-emails',
    espace: 'admin',
    tag: 'Admin — Modèles d’email',
    routeur: r('catalogue', 'modeleEmail'),
  },
  {
    chemin: '/admin/inventaire',
    espace: 'admin',
    tag: 'Admin — Inventaire',
    routeur: r('inventaire', 'inventaire'),
  },
  {
    chemin: '/admin/avis',
    espace: 'admin',
    tag: 'Admin — Avis clients',
    routeur: r('avis', 'avisAdmin'),
  },
  { chemin: '/admin/faq', espace: 'admin', tag: 'Admin — FAQ', routeur: r('faq', 'faq') },
  {
    chemin: '/admin/app-version',
    espace: 'admin',
    tag: 'Admin — Version application',
    routeur: r('appVersion', 'appVersionAdmin'),
  },
  {
    chemin: '/admin/demandes-contact',
    espace: 'admin',
    tag: 'Admin — Demandes de contact',
    routeur: r('demandeContact', 'demandeContactAdmin'),
  },
  {
    chemin: '/admin/suppressions-compte',
    espace: 'admin',
    tag: 'Admin — Suppression de compte',
    routeur: r('compte', 'suppressionCompteAdmin'),
  },
];

module.exports = { ROUTES };
