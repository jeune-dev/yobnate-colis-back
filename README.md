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
| `/public` | Public | Suivi, simulation sans compte, tarifs, catégories, accueil (annonces, tournées), configuration |
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
| `/admin/articles-tarif` · `/admin/emballages` | Admin | Grille forfaitaire, barigots et emballages |
| `/admin/tournees-collecte` | Admin | Tournées de collecte à domicile |
| `/admin/conteneurs` · `/admin/inventaire` | Admin | Conteneurs et inventaire des chargements |
| `/admin/annonces` · `/admin/modeles-emails` | Admin | Accueil de l'app et modèles d'emails |
| `/admin/parrainage` · `/admin/dashboard/kpis` | Admin | Parrainage et indicateurs commerciaux |
| `/admin/parametres` | Super Admin | Réglages du moteur métier |
| `/admin/activity-logs` | Admin | Journal d'activité |

## Documentation API

Disponible en développement sur : `http://localhost:<PORT>/api-docs`

## Licence

Propriétaire — tous droits réservés.
