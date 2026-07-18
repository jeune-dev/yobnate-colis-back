# Yobnate Colis — Backend API

API REST de gestion et suivi de colis pour la plateforme Yobnate Colis.

## Stack technique

- **Runtime :** Node.js 22
- **Framework :** Express 4
- **ORM :** Sequelize 6
- **Base de données :** PostgreSQL 16
- **Auth :** JWT (access + refresh token) + blacklist
- **Upload :** Cloudinary (via Multer mémoire)
- **Email :** Nodemailer (SMTP)
- **Documentation :** Swagger UI (désactivée en production)
- **Conteneurisation :** Docker + Docker Compose

## Prérequis

- Node.js >= 18
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
```

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner toutes les valeurs. Voir `.env.example` pour la liste complète et les contraintes (secrets JWT min. 32 caractères, distincts).

> **Important :** Ne jamais commiter le fichier `.env` ni aucun secret dans le dépôt Git.

## Scripts

| Commande | Description |
|---|---|
| `npm start` | Démarrage production |
| `npm run dev` | Démarrage développement (nodemon) |
| `npm run seed` | Création du super admin et des données initiales |
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
├── app.js              # Configuration Express et middlewares
├── server.js           # Point d'entrée, démarrage et graceful shutdown
├── config/             # Configuration (DB, JWT, Cloudinary, Swagger…)
├── controllers/        # Handlers HTTP (admin/, client/)
├── middlewares/        # Auth, validation, rate limit, upload, erreurs
├── models/             # Models Sequelize et associations
├── routes/             # Définition des routes (admin/, client/)
├── services/           # Logique métier (admin/, client/)
├── utils/              # ApiError, asyncHandler, mailer, paginate…
├── validations/        # Schémas Joi
└── seeders/            # Données initiales
deploy/
├── nginx.conf          # Configuration Nginx (reverse proxy TLS)
└── init.sql            # Extensions PostgreSQL initiales
```

## Routes principales

| Préfixe | Accès | Description |
|---|---|---|
| `/auth` | Public | Inscription, connexion, refresh, logout, reset mot de passe |
| `/client/colis` | Client authentifié | Déclarer, suivre, annuler ses colis |
| `/client/profil` | Client authentifié | Profil et avatar |
| `/client/notifications` | Client authentifié | Notifications |
| `/client/paiements` | Client authentifié | Factures |
| `/admin/dashboard` | Admin | Statistiques |
| `/admin/users` | Admin | Gestion des clients |
| `/admin/admins` | Admin / Super Admin | Gestion des administrateurs |
| `/admin/colis` | Admin | Gestion et suivi des colis |
| `/admin/villes` | Admin | Référentiel des villes |
| `/admin/tarifs` | Admin | Grille tarifaire |
| `/admin/factures` | Admin | Factures |
| `/admin/paiements` | Admin | Enregistrement et remboursement des paiements |
| `/admin/activity-logs` | Admin | Journal d'activité |

## Documentation API

Disponible en développement sur : `http://localhost:<PORT>/api-docs`

## Licence

Propriétaire — tous droits réservés.
