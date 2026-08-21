# Yobnate Express — Backend API

API REST de transport express de colis entre la **France** et le **Sénégal**,
inspirée du fonctionnement d'un intégrateur comme DHL Express : réseau de
points de collecte défini par l'administrateur dans chacun des deux pays,
tarification au poids réel/volumétrique, suivi événementiel détaillé,
formalités douanières, facturation multi-devise et service après-vente.

## Stack technique

- **Runtime :** Node.js ≥ 18
- **Framework :** Express 4
- **ORM :** Sequelize 6
- **Base de données :** PostgreSQL 16
- **Auth :** JWT (access + refresh token) + blacklist, rôles multiples
- **Upload :** Cloudinary (via Multer mémoire)
- **Email :** Nodemailer (SMTP), gabarits HTML en français
- **Documents :** étiquettes et bordereaux HTML imprimables avec code-barres
  Code 128 généré en interne (aucune dépendance externe)
- **Documentation :** Swagger UI (désactivée en production)
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

## Prérequis

- Node.js ≥ 18
- PostgreSQL 16
- Compte Cloudinary
- Compte SMTP (Gmail ou autre)

## Installation

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd yobnate-colis-back

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Remplir toutes les variables dans .env

# 4. Démarrer PostgreSQL, puis lancer l'application
npm run dev

# 5. Amorcer les données de référence (super admin, paramètres, villes,
#    services, grille tarifaire de base, premiers points de collecte)
npm run seed
```

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
| `npm run migrate` | Exécuter les migrations Sequelize |
| `npm run migrate:undo` | Annuler la dernière migration |
| `npm test` | Lancer les tests |
| `npm run lint` | Vérification ESLint |

## Démarrage avec Docker

```bash
# Copier et remplir les variables d'environnement
cp .env.example .env

# Démarrer la stack complète
docker compose up -d

# Initialiser les données
docker compose exec backend npm run seed
```

## Structure du projet

```
src/
├── app.js              # Configuration Express et montage des routes
├── server.js           # Point d'entrée, démarrage et graceful shutdown
├── config/              # Configuration (DB, JWT, Cloudinary, Swagger…)
├── constants/           # Référentiels métier (pays, statuts, rôles, réseau, facturation)
├── controllers/         # Handlers HTTP (admin/, client/, public/)
├── middlewares/          # Auth, rôles, validation, rate limit, upload, erreurs
├── models/              # Modèles Sequelize et associations (28 entités)
├── routes/               # Définition des routes (admin/, client/, public.route.js)
├── services/             # Logique métier (admin/, client/, moteur de tarification, suivi…)
├── utils/                # ApiError, mailer, documents HTML, code-barres, devise, délais…
├── validations/          # Schémas Joi
└── seeders/              # Données de référence
deploy/
├── nginx.conf            # Configuration Nginx (reverse proxy TLS)
└── init.sql              # Extensions PostgreSQL initiales
```

## Routes principales

| Préfixe | Accès | Description |
|---|---|---|
| `/auth` | Public | Inscription, connexion, refresh, logout, reset mot de passe |
| `/public` | Public | Suivi d'expédition, recherche de points, catalogue, devis |
| `/client/colis` | Client | Devis, déclaration, suivi, annulation, documents |
| `/client/enlevements` | Client | Demandes d'enlèvement à domicile |
| `/client/adresses` | Client | Carnet d'adresses |
| `/client/paiements` | Client | Factures, règlements, encours |
| `/client/reclamations` | Client | Ouverture et suivi des réclamations |
| `/client/profil` | Client | Profil, préférences, avatar |
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
| `/admin/parametres` | Super Admin | Réglages du moteur métier |
| `/admin/activity-logs` | Admin | Journal d'activité |

## Documentation API

Disponible en développement sur : `http://localhost:<PORT>/api-docs`

## Licence

Propriétaire — tous droits réservés.
