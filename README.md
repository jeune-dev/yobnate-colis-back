# Yobante Colis — Backend API

API REST de transport express de colis entre la **France** et le **Sénégal**,
inspirée du fonctionnement d'un intégrateur comme DHL Express : réseau de
points de collecte défini par l'administrateur dans chacun des deux pays,
tarification au poids réel/volumétrique, suivi événementiel détaillé,
formalités douanières, facturation multi-devise et service après-vente.

## Stack technique

- **Runtime :** Node.js 22
- **Framework :** Express 4
- **ORM :** Sequelize 6
- **Base de données :** PostgreSQL 16
- **Auth :** JWT (access + refresh token) + blacklist, rôles multiples
- **Upload :** Cloudflare R2 (via Multer mémoire, contenu vérifié par magic bytes)
- **Email :** Nodemailer (SMTP), gabarits HTML en français
- **Documents :** étiquettes et bordereaux HTML imprimables avec code-barres
  Code 128 généré en interne (aucune dépendance externe)
- **Documentation :** OpenAPI générée à partir des routes réelles (Swagger UI hors production)
- **Cache partagé :** Redis (compteurs des limiteurs de débit), facultatif
- **Conteneurisation :** Docker + Docker Compose

## Périmètre métier

Le service ne dessert que le corridor **France ⇄ Sénégal** :

- **Réseau** — l'administrateur définit, pour chaque pays, ses points de
  collecte (agences, points relais, casiers, hubs de tri), avec horaires,
  prestations, capacités et géolocalisation.
- **Offre** — plusieurs services d'expédition (Standard, Express…) portent
  chacun leurs propres délais, gabarits et coefficient volumétrique.
- **Tarification** — grille par service × corridor × tranche de poids, avec
  surcharges automatiques (carburant, zone éloignée…), assurance ad valorem et
  conversion EUR ⇄ XOF.
- **Expédition** — lettre de transport multi-colis, dépôt en point ou
  enlèvement à domicile, retrait en point ou livraison à domicile, suivi à
  codes d'événements, preuve de livraison.
- **Douane** — déclaration détaillée ligne à ligne (codes SH), incoterms
  DAP/DDP, estimation des droits et taxes, facture commerciale.
- **Facturation** — factures multi-devise, paiements partiels, avoirs,
  relances.
- **Après-vente** — réclamations avec fil de messages et indemnisation.

### Parcours par catégorie de colis

| | Catégorie 1 — Documents | Catégorie 2 — Colis moyen | Catégorie 3 — Colis XXL |
|---|---|---|---|
| Prix | Forfait fixe (grille) | Forfait par article (grille) ou au poids | Proposé par l'admin sous 24 h |
| Validation admin | Non | Oui | Oui (proposition tarifaire à accepter) |
| Facture / paiement | À la commande | À la réception du colis (lien de paiement) | À l'acceptation de la proposition |
| Photos exigées | 1 (enveloppe) | 3 angles | 1 minimum + dimensions |
| Remise | Point, poste, boîte aux lettres | + collecte à domicile | Point ou collecte (étage, ascenseur, emballage) |

- **Grille forfaitaire** (`/admin/articles-tarif`) : prix par article, colonnes
  *Dakar* / *autres régions* (villes marquées `zoneTarifDakar`), par mode de
  fret (maritime / aérien). Le tarif au kilo reste géré par service (`/admin/tarifs`).
- **Numéro de suivi** : `PNCO0126032026MDT03` = préfixe + n° de conteneur +
  date + initiales du client + catégorie (préfixes paramétrables).
- **Adresse au Sénégal** : quartier, arrondissement, département et point de
  repère obligatoires (bloquants) pour les catégories 2 et 3.
- **Collecte** : tournées programmées par l'admin (date, villes, codes postaux),
  bannière dans l'app et notification des clients de la zone ; tarif Colissimo
  et enlèvement à domicile paramétrables.
- **Conteneurs** (`/admin/conteneurs`, alias des rotations) : numérotation 01,
  02…, étapes propagées aux colis (expédié vers le port, dédouanement, arrivée
  plateforme) et **inventaire imprimable** des produits chargés (quantité, état
  neuf/occasion) par conteneur ou par tournée (`/admin/inventaire`).
- **Relation client** : connexion par email ou téléphone, confirmation de
  l'email par lien, parrainage, tarif professionnel (NINEA/Kbis validé),
  notifications push (FCM) et WhatsApp, message vocal, modèles d'emails
  personnalisables, annonces sur l'accueil de l'application.

## Prérequis

- Node.js 22
- PostgreSQL 16
- Redis 7 (facultatif ; fourni par docker-compose.prod.yml)
- Bucket Cloudflare R2 (variables `R2_*`)
- Compte SMTP (Gmail ou autre)

## Installation

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd yobnate-colis-back

# 2. Installer les dépendances (versions verrouillées)
npm ci

# 3. Configurer les variables d'environnement
cp .env.example .env
# Remplir toutes les variables dans .env

# 4. Démarrer PostgreSQL, puis lancer l'application (les migrations créent le schéma)
npm run dev

# 5. Amorcer les données de référence (super admin, paramètres, villes,
#    services, grille tarifaire de base, premiers points de collecte)
npm run seed
```

> **Base existante :** `npm run migrate` applique la migration additive
> `20260925000001-cahier-des-charges-colis` (nouvelles tables, colonnes et
> valeurs d'ENUM), puis `npm run seed` ajoute les nouveaux paramètres et la
> grille forfaitaire. Le serveur n'appelle jamais `sequelize.sync()` : le schéma
> (tables, index) est créé et mis à jour uniquement par les migrations, que
> `npm start` et `npm run dev` exécutent avant de démarrer.

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner toutes les valeurs. Voir
`.env.example` pour la liste complète et les contraintes (secrets JWT min.
32 caractères, distincts). Les réglages du moteur métier (taux de change,
taux de TVA, seuils, délais…) ne sont **pas** des variables d'environnement :
ils vivent en base (`ParametreSysteme`) et se pilotent depuis
`/admin/parametres`, avec des valeurs de repli sûres si la table est vide.

> **Important :** Ne jamais commiter le fichier `.env` ni aucun secret dans le dépôt Git.

## Scripts

| Commande | Description |
|---|---|
| `npm start` | Démarrage production |
| `npm run dev` | Démarrage développement (nodemon) |
| `npm run seed` | Données de référence : super admin, paramètres, villes, services, tarifs, points de collecte |
| `npm run migrate` | Appliquer les migrations (`migrate:status`, `migrate:undo`) |
| `npm run schema:verifier` | Vérifier que la base migrée contient toutes les colonnes des modèles |
| `npm test` | Tests unitaires, sécurité et intégration |
| `npm run lint` · `npm run format:check` | ESLint et Prettier |
| `npm run docs:openapi` | Écrire la documentation OpenAPI dans `docs/openapi.json` |

## Tests

```
tests/
├── unit/          # logique pure, modèles simulés, aucune base
├── security/      # garde-fous transverses (chaque route protégée, garde de rôle)
├── integration/   # API réelle (supertest) sur une base PostgreSQL JETABLE
└── helpers/       # environnement, fabriques de données, préparation de la base
```

Les suites d'intégration ne s'exécutent que si `TEST_DB_NAME` est défini (sinon
elles sont signalées « skipped »). La base est **vidée et recréée** à chaque
exécution : son nom doit se terminer par `_test`, et les variables `DB_*` du
`.env` ne sont jamais utilisées pour les tests.

```bash
TEST_DB_NAME=yobante_colis_test TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5432 \
TEST_DB_USER=postgres TEST_DB_PASSWORD=... npm test
```

La CI (`.github/workflows/ci.yml`) les exécute sur un service PostgreSQL dédié.

## Migrations en production

Le schéma de production est porté exclusivement par les migrations (le
serveur ne fait jamais de `sync()` en production) :

- **Docker** : `docker-entrypoint.sh` attend PostgreSQL puis lance
  `sequelize-cli db:migrate` avant de démarrer ; un échec empêche le démarrage ;
- **PM2** : `bash deploy/deploy.sh pm2` lance `npm run migrate`.

La CI applique les migrations sur une base vierge, vérifie leur idempotence et
la conformité du schéma aux modèles (`scripts/verifierSchema.js`).

## Déploiement

```bash
# Première installation du VPS : bash deploy/setup-server.sh (puis suivre ses instructions)
cp .env.example .env.prod && chmod 600 .env.prod   # remplir les secrets
bash deploy/deploy.sh docker                       # ou : bash deploy/deploy.sh pm2
```

- toutes les commandes Docker de production utilisent
  `docker compose --env-file .env.prod -f docker-compose.prod.yml …` ;
- un push sur `main` déclenche `.github/workflows/deploy.yml` : la CI complète
  doit être verte, puis le déploiement attend que le conteneur soit *healthy* ;
- sauvegarde quotidienne : `deploy/backup-postgres.sh` (chiffrée si
  `BACKUP_ENC_KEY`), restauration : `deploy/restore-postgres.sh` ;
- sondes : `/health` (vie du processus, sans base) et `/ready` (base comprise, 503 sinon et pendant l’arrêt) — le HEALTHCHECK et le déploiement utilisent `/ready`.

## Démarrage avec Docker (développement)

```bash
cp .env.example .env        # remplir DB_* et les secrets JWT
docker compose up -d --build
docker compose exec backend npm run seed
```

## Structure du projet

Organisation par modules, sur le modèle de Widjila :

```
src/
├── app.js               # Express : sécurité, journal HTTP, santé, montage des routes
├── server.js            # Démarrage, tâches planifiées, arrêt gracieux
├── modules/
│   ├── index.js         # Table unique des routes (montage, tests de sécurité, OpenAPI)
│   └── <module>/        # auth, colis, paiement, facture, compte, admin, pointCollecte…
│       ├── controller/  # Handlers HTTP (minces)
│       ├── route/       # Routes + gardes (auth, rôle, validation)
│       ├── service/     # Logique métier et accès aux données
│       └── validation/  # Schémas Joi
├── config/              # DB, sécurité, Redis, OpenAPI, référentiels (rôles, pays, colis…)
├── errors/              # AppError et erreurs typées
├── infrastructure/      # Email, stockage R2, WhatsApp, push
├── jobs/                # Tâches planifiées (node-cron)
├── middlewares/         # Auth, rôles, périmètre, validation, débit, upload, erreurs
├── migrations/          # Migrations Sequelize
├── models/              # Modèles et associations
├── seeders/             # Données de référence
├── templates/           # Documents HTML (étiquettes, bordereaux, factures)
├── utils/               # Logger, cache, pagination, périmètre, inventaire des routes…
└── validations/         # Schémas Joi communs
deploy/                  # Nginx, déploiement, sauvegarde/restauration, installation du VPS
scripts/                 # Vérification du schéma, export OpenAPI, super admin
```

## Rôles et périmètres

| Rôle | Périmètre |
|---|---|
| `client` | Ses propres expéditions, factures, adresses, réclamations |
| `agent_point` | Colis, encaissements et caisse de **son** point de collecte |
| `coursier` | Enlèvements et livraisons qui lui sont **affectés**, ses encaissements |
| `admin` · `super_admin` | Tout le back-office (`super_admin` : paramètres système) |

Une ressource hors périmètre répond 404. Les routes publiques et leurs raisons
sont listées dans `tests/security/routes.gardes.test.js`.

## Routes principales

| Préfixe | Accès | Description |
|---|---|---|
| `/auth` | Public | Inscription, connexion, refresh, logout, reset mot de passe |
| `/public` | Public | Suivi, simulation sans compte, tarifs, catégories, accueil (annonces, tournées), configuration |
| `/client/colis` | Client | Devis, déclaration, suivi, annulation, documents |
| `/client/enlevements` | Client | Demandes d'enlèvement à domicile |
| `/client/adresses` | Client | Carnet d'adresses |
| `/client/paiements` | Client | Factures, règlements, encours |
| `/client/reclamations` | Client | Ouverture et suivi des réclamations |
| `/client/profil` | Client | Profil, préférences, avatar, vérification du téléphone |
| `/client/compte` | Client | Export RGPD, suppression du compte |
| `/app-version` · `/suppression-compte` | Public | Version de l’app mobile, demande de suppression (Google Play) |
| `/client/notifications` | Client | Notifications |
| `/admin/dashboard` | Admin | Statistiques globales et par pays |
| `/admin/points-collecte` | Admin | Réseau de points de collecte |
| `/admin/zones` · `/admin/villes` | Admin | Référentiel géographique |
| `/admin/services` · `/admin/tarifs` · `/admin/surcharges` | Admin | Offre et tarification |
| `/admin/jours-feries` | Admin | Calendrier des jours non ouvrés |
| `/admin/colis` | Admin | Acheminement, pesée, incidents, documents |
| `/admin/rotations` | Admin | Départs groupés (manifeste, chargement) |
| `/admin/enlevements` | Admin | Planification des tournées de coursiers |
| `/admin/douane` | Admin | Déclarations douanières |
| `/admin/reclamations` | Admin | Service après-vente |
| `/admin/factures` · `/admin/paiements` | Admin | Facturation et caisse |
| `/admin/users` · `/admin/personnel` · `/admin/admins` | Admin | Comptes (clients, coursiers/agents, admins) |
| `/admin/articles-tarif` · `/admin/emballages` | Admin | Grille forfaitaire, barigots et emballages |
| `/admin/tournees-collecte` | Admin | Tournées de collecte à domicile |
| `/admin/conteneurs` · `/admin/inventaire` | Admin | Conteneurs et inventaire des chargements |
| `/admin/annonces` · `/admin/modeles-emails` | Admin | Accueil de l'app et modèles d'emails |
| `/admin/parrainage` · `/admin/dashboard/kpis` | Admin | Parrainage et indicateurs commerciaux |
| `/admin/parametres` | Super Admin | Réglages du moteur métier |
| `/admin/activity-logs` | Admin | Journal d'activité |
| `/admin/app-version` · `/admin/suppressions-compte` | Admin | Version de l’app, demandes de suppression |

## Documentation API

Générée à partir des routes réellement montées (authentification, rôles et
schémas Joi du code) :

- développement : `http://localhost:<PORT>/api-docs` et `/api-docs.json` ;
- fichier : `npm run docs:openapi` → `docs/openapi.json`.

Chemin canonique : `/api/v1/…` ; les chemins sans préfixe restent servis.

## Licence

Propriétaire — tous droits réservés.
