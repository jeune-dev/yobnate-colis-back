# Audit critique du backend — Yobnate Colis

Audit du 27/09/2026, sur `main` au commit `a693962`. Les corrections sont sur la branche
`claude/amazing-carson-4ya8x3` (commit `f0c67f7`).

## Méthode et limites

- **Chiffres** : tous les chiffres ci-dessous ont été **mesurés**. Ce qui n'a pas pu l'être est
  marqué « non mesuré » ou « revue de code ».
- **Environnement** :
  - conteneur Linux 4 vCPU / 16 Go, Node.js 22.22 ;
  - PostgreSQL 16 local, **réglages par défaut** : `shared_buffers` 128 Mo, `work_mem` 4 Mo,
    `max_connections` 100 ;
  - un seul processus Node et un pool de 10 connexions, comme le `docker-compose.prod.yml`.
- **Biais de mesure** : le générateur de charge, l'API et PostgreSQL partagent la même machine.
  - Les débits absolus sont donc **plus bas** que sur un serveur dédié.
  - La variance entre deux essais identiques est de **±10 %** (mesurée sur `/health` : 3 948
    à 4 650 req/s). Un écart inférieur n'est pas significatif.
- **Base de mesure** (`scripts/perf/seed.sql` + `scripts/perf/seed-mesures.sql`) :
  - 20 000 comptes, 200 000 colis, 600 000 pièces, 1,2 M événements de suivi ;
  - 200 000 notifications, 40 000 factures, 20 000 paiements, 200 000 journaux d'activité ;
  - 1 000 000 sessions de visite, 300 000 simulations de devis, 19 000 avis ;
  - 200 000 jetons révoqués, 100 000 refresh tokens.
- **Production non mesurée** : aucun accès à la base ni au serveur de production. Les
  `EXPLAIN ANALYZE` ont été exécutés sur la base de mesure uniquement.
- **Outils**, ajoutés au dépôt :
  - `scripts/perf/charge-profils.js` : charge par profil d'utilisation ;
  - `scripts/perf/requetes-par-endpoint.js` : requêtes SQL et durée par endpoint ;
  - `scripts/perf/detecteur-transactions.js` : connexions prises hors d'une transaction ouverte ;
  - autocannon.

---

## 1. Cartographie

| Élément | Constat |
|---|---|
| Taille | 263 fichiers et 29 600 lignes dans `src/` ; 29 modules, 41 modèles, 293 routes |
| Couches | Routes, puis contrôleurs (minces), puis services (métier), puis modèles Sequelize. Pas de requête SQL dans les routes ni dans les contrôleurs |
| ORM | Sequelize 6.37 sur `pg` 8.13 ; SQL brut paramétré pour les agrégats (`replacements`) |
| Schéma | Migrations `sequelize-cli` (dont `CONCURRENTLY`), `sync()` absent du démarrage |
| Auth | JWT HS256, 1 h. Refresh token 7 jours, à usage unique. Liste de révocation en base, contrôlée à chaque requête. `tokenVersion`. bcrypt coût 12 |
| Cache | `Map` en mémoire **par processus** (TTL, borne 10 000 entrées, anti-ruée `memoiser`) |
| Envois externes | SMTP (nodemailer en pool), FCM, WhatsApp Cloud API, Cloudinary, par une file en mémoire |
| Tâches | `setInterval` dans le processus web, réservation atomique en base (`taches_planifiees`) |
| Fichiers | multer en **mémoire**, puis Cloudinary |
| Temps réel | Aucun WebSocket |
| Production | Docker Compose : 1 conteneur API (`cpus: 1`, 512 Mo), PostgreSQL (512 Mo), Redis (compteurs des limiteurs), Nginx sur l'hôte. Alternative : PM2 cluster |

**Architecture** : la séparation des responsabilités est propre ; aucune logique métier dans
les contrôleurs n'a été trouvée. Deux fragilités de conception :

- `suivi.enregistrerEvenement` est le point d'entrée unique de tout changement d'état, ce qui
  est une bonne chose. Mais il déclenchait ses effets de bord (notifications, journal,
  facturation) **à l'intérieur** des transactions de ses appelants (voir §2).
- Plusieurs services lisent un état **sans verrou** avant d'écrire (voir §2).

---

## 2. Concurrence — ce qui se passait réellement

### 2.1 [P0] Épuisement du pool : l'API entière bloquée par 10 requêtes

**Code avant** (`suivi.service.js`) : appelé avec `{ transaction: t }` par l'annulation, la
validation, la proposition tarifaire, l'acceptation et l'expiration automatique.

```js
const { evenement } = options.transaction
  ? await executer(options.transaction)   // la transaction de l'appelant reste OUVERTE
  : await sequelize.transaction(executer);
await logActivity(...);                    // connexion n° 2 prise au pool
await notificationService.notifier(...);   // Notification.create + User.findByPk : n° 3, 4
await notificationService.diffuserEvenement(...);
```

**Problème** : chaque requête tient une connexion (sa transaction, et le verrou `FOR UPDATE` du
colis), puis en demande une autre au pool. Avec un pool de 10 et 10 requêtes simultanées, les
10 connexions sont tenues et chaque requête attend une 11e qui ne vient jamais. Cela dure
jusqu'au délai d'acquisition (15 s, parfois deux fois de suite), puis se termine en 503.

**Mesure** (`PATCH /client/colis/:id/annuler`, colis et clients distincts, pool de 10) :

| Annulations simultanées | Avant | Après |
|---:|---|---|
| 5 | 191 ms, 5 × 200 | 210 ms, 5 × 200 |
| 10 | **30 249 ms, 3 × 200, 7 × 503** | 343 ms, 10 × 200 |
| 20 | **30 326 ms, 6 × 200, 14 × 503** | 469 ms, 20 × 200 |
| 40 | **30 332 ms, 4 × 200, 36 × 503** | 712 ms, 40 × 200 |

Pendant ces 30 s, **toutes** les autres requêtes de l'API attendaient aussi une connexion.

**Détection systématique** : `scripts/perf/detecteur-transactions.js` a relevé, sur la suite
de tests, **61 requêtes** émises hors d'une transaction encore ouverte. Elles venaient de
5 parcours (annulation, validation, proposition, acceptation, expiration) et de la création de
séquence de `referenceGenerator` (premières références après un redémarrage). Après
correction : **0**.

**Correction** (`src/utils/transactions.js`) :

```js
// Dans enregistrerEvenement
if (options.transaction) await apresCommit(options.transaction, effets); // après COMMIT, connexion rendue
else await effets();
```

- `apresCommit` s'accroche au COMMIT de la transaction racine (points de sauvegarde compris).
- Il n'exécute rien si la transaction est annulée.
- Il journalise ses erreurs sans les propager.
- `referenceGenerator` crée sa séquence **dans** la transaction, sous point de sauvegarde.

### 2.2 [P1] Notifications « fantômes »

Même cause : la notification et l'email partaient **avant** le COMMIT. Si la suite échouait
(par exemple l'émission de la facture après `DEVIS_ACCEPTE`), la transaction était annulée,
mais le client était déjà prévenu.

**Test** : événement puis annulation de la transaction. **1 notification créée** avant
correction, **0** après.

### 2.3 [P1] Lectures sans verrou avant écriture (SELECT → contrôle → UPDATE)

| Opération | Scénario | Avant (mesuré) | Correction |
|---|---|---|---|
| Résolution de réclamation avec indemnisation | Double clic ou deux agents | **2 × 200, deux avoirs d'indemnisation** | Statut relu `FOR UPDATE` dans la transaction ; le second reçoit 400 |
| Avoir sur facture | Deux avoirs de 60 % en parallèle | **2 × 200, 120 % de la facture compensés**. Même en séquentiel, aucun contrôle du cumul | Colonne `factureOrigineId` (migration + rattachement des avoirs existants), verrou de la facture, cumul contrôlé |
| Statut d'un conteneur (`en_transit`) | Deux clics | **2 × 200** : événement propagé deux fois à chaque colis, donc deux notifications par client | `UPDATE … WHERE statut = <statut lu>` ; le perdant reçoit 409 (ou 400 s'il arrive après) |
| Création de compte, avis général unique | Deux envois simultanés | Non mesuré ; l'unicité de l'email en base protège le compte, pas l'avis général | P4, non corrigé |

Les opérations déjà protégées depuis l'audit précédent (encaissements, remboursements, stock
des points, chargement des conteneurs, crédit de parrainage, tournées, emballages, tâches
planifiées) ont été relues ; aucune régression. L'ordre des verrous est cohérent : paiement
puis facture, colis puis factures. Aucun interblocage n'a été observé :
`pgAttentesVerrouMax` = 0 sur toutes les campagnes.

---

## 3. Pool de connexions

| Paramètre | Valeur | Avis |
|---|---|---|
| `max` | `DB_POOL_MAX` = 10 par processus | Suffisant pour un processus. Pendant la charge, la base n'a jamais dépassé 7 connexions actives |
| `acquire` | 15 s puis 503 | Correct |
| `statement_timeout` / `idle_in_transaction_session_timeout` | 30 s / 60 s | Correct |
| Libération | Transactions gérées par fonction de rappel, aucun `pool.connect()` manuel | Aucune fuite trouvée |

**Calcul du nombre total de connexions** :

- Docker Compose : 1 processus × 10 = 10 connexions, pour `max_connections` = 100.
- PM2 (`ecosystem.config.js`) : `instances: 'max'`, donc un worker par cœur, soit
  cœurs × 10 connexions. Sur un hôte de 16 cœurs, cela fait **160 > 100**, et donc
  **« too many clients »** au démarrage des workers.
  - Le commentaire du fichier le signale désormais.
  - Il faut fixer `PM2_INSTANCES` explicitement (P2).

---

## 4. Requêtes N+1

Aucun N+1 sur les endpoints de lecture : les listes et les détails font 1 à 8 requêtes, quel
que soit le volume (tableau §11). Boucles restantes, avec une requête par élément :

| Fichier / fonction | Requêtes générées | 10 / 100 / 1 000 éléments | Décision |
|---|---|---|---|
| `rotation.service.changerStatut` : événement par colis embarqué | ~10 par colis, chacun sous son verrou | ~100 / ~1 000 / ~10 000 (2,4 s pour 300 colis, audit précédent) | Règle métier (historique, stock et notification par colis). Assumé ; passer en tâche de fond au-delà de quelques milliers de colis |
| `facture.service.relancerEchues` (POST admin) | ~3 par facture échue, en série, **dans la requête HTTP**, sans borne | 30 / 300 / 3 000 | P3 (revue de code) : passer en tâche de fond ou par lots |
| `notification.service.notifierAdmins` | 2 par administrateur, en parallèle | Faible (quelques admins) | P4 : `bulkCreate` |
| `jourFerie.importerCalendrier` | 2 par jour | ~30 par an | P4, sans enjeu |

---

## 5 à 7. Requêtes SQL, index, EXPLAIN ANALYZE

### Index ajoutés (migration `20260927000001-index-listes-connexion`, `CONCURRENTLY`)

| Table (colonnes) | Requête concernée | EXPLAIN ANALYZE avant | Après |
|---|---|---|---|
| `paiements ("createdAt")` | Liste et export admin, `ORDER BY createdAt DESC LIMIT 20` | Jointure de **toute** la table (factures, colis, comptes) en Hash Join, fichiers temporaires (1 679 blocs), puis tri : **212 ms** | Parcours d'index inversé, 20 lignes : **4 ms** |
| `factures ("createdAt")` | Liste et export admin | Seq Scan de 40 000 lignes + jointures : **168 ms** | Index Scan Backward : **0,66 ms** |
| `avis ("createdAt" DESC, id DESC)` | File de modération sans filtre de statut | L'index `(statut, createdAt)` n'était pas utilisé : **81 ms** | **0,67 ms** |
| `users (lower(email))` | Connexion, inscription et codes : `WHERE lower(email) = …` | **Seq Scan** de toute la table des comptes à chaque connexion : 5,2 ms pour 20 000 comptes, proportionnel au nombre de comptes | Bitmap Index Scan : **0,13 ms** |

### Écartés

- **Index couvrant `visites (debut) INCLUDE ("visiteurId")`** : aucun gain (887 ms dans les deux
  cas). Le coût vient du `COUNT(DISTINCT "visiteurId")`, qui trie ~1 M lignes **sur disque**
  (`work_mem` 4 Mo). Voir P3.
- **Clés étrangères non indexées** (`colis.creePar`, `validePar`, `suivi_colis.createdBy`,
  `factures.emisePar`…) : elles ne comptent que si l'on **supprime** un compte. Or les comptes
  ne sont jamais supprimés, mais pseudonymisés. Ajouter ces index ralentirait des écritures
  fréquentes (`suivi_colis` : 1,2 M lignes) pour rien. Non ajoutés.

### Autres constats SQL

- Toutes les requêtes brutes sont paramétrées (`replacements`) : aucune injection trouvée.
- **Recherche de comptes admin** : `ILIKE '%…%'` sur 5 colonnes, en Seq Scan (33 ms pour
  20 000 comptes). P3 : index trigrammes si le nombre de comptes grandit.
- **Parrainage admin** : tri par un comptage de filleuls calculé pour **tous** les comptes à
  chaque page. P3.
- **Tableau de bord marketing / conversion / KPI** sur longue période (visites depuis le
  01/01/2025) :
  - 764 à 996 ms à froid, à cause du tri sur disque ;
  - chaque plage de dates distincte est recalculée (cache de 60 s par plage).
  - P3 : table d'agrégats quotidiens si le trafic réel approche ce volume.

---

## 8. Pagination

- Toutes les listes sont bornées (`MAX_LIMIT` 100). Les exports sont plafonnés à 10 000 lignes,
  **sans signal au client** quand la limite est atteinte (P3).
- **Listes admin des factures et des paiements** : `findAndCountAll` faisait un
  `COUNT(DISTINCT)` joint à 4 ou 5 tables, sur toute la table. Elles passent désormais par
  `listerPagine` : comptage sans jointure, puis identifiants, puis lignes.
- **OFFSET profond** : page 5 000 de la liste admin des colis, 124 à 159 ms (OFFSET 100 000).
  Une pagination par curseur (`createdAt`, `id`) serait préférable si le back-office parcourt
  réellement ces profondeurs (P3). Elle change le contrat, donc à valider avec le front.

---

## 9. Mémoire

| Constat | Mesure | Statut |
|---|---|---|
| multer en mémoire, sans plafond de requêtes simultanées | 30 déclarations simultanées de 20 Mo (sous la limite Nginx de 25 Mo) : **568 Mo**, pour un conteneur limité à **512 Mo**, donc arrêt par le noyau (OOM) et toutes les requêtes en cours perdues. À 60 requêtes (3 processus) : 1 494 Mo | **Corrigé** : au plus `UPLOAD_CONCURRENCE` (4) réceptions simultanées par processus, les suivantes attendent au plus 30 s puis reçoivent 503. **277-296 Mo** à 10, 30 et 60 envois simultanés |
| Mémoire en charge (500 connexions) | 317 à 342 Mo au plus | Stable, pas de croissance entre essais |
| Cache, file d'envois | Bornés (10 000 entrées ; 5 000 envois par canal) | Correct |
| Minuteurs | `unref`, arrêtés à l'arrêt | Correct |

---

## 10. Boucle d'événements

- Aucune API synchrone (`*Sync`, `execSync`, crypto synchrone) dans `src/`.
- **bcrypt** : ~250 ms de CPU par hachage, calculés sur le pool de threads mais sur les
  **mêmes cœurs**.
  - Pendant 40 connexions simultanées, une lecture publique passait de **1 491 req/s
    (p50 5 ms) à 4 req/s (p50 2 439 ms)**.
  - Augmenter `UV_THREADPOOL_SIZE` à 16 n'y change rien (4 req/s, mesuré) : c'est le CPU qui
    est saturé, pas le pool de threads.
  - **Correction** : au plus `BCRYPT_CONCURRENCE` hachages simultanés (2 par défaut, 1 dans le
    compose à 1 vCPU). Pendant la même rafale, les lectures restent à **1 491 req/s, p50 5 ms**.
  - **Contrepartie** : les connexions passent de 15 à 8 par seconde. Pendant une rafale de
    40 connexions simultanées, leur p50 passe de 2,5 s à 4,1 s.
- **Exports CSV** (10 000 lignes) : construction des instances Sequelize et du CSV dans la
  boucle.
  - Factures : **1 328 → 346 ms**. Paiements : **870 → 227 ms**. Contenu **identique** octet
    pour octet (vérifié sur une sélection non tronquée).
  - Export des colis : ~1 s, **non corrigé** (P3).
- **Profil CPU** sous charge (profil « client », 50 connexions) :
  - **~45 %** du temps dans Sequelize : construction des instances, `_groupJoinData`,
    `lodash` ;
  - `jsonwebtoken` convertissait le secret en clé à chaque vérification (`createPublicKey`
    en échec, puis `createSecretKey`). Corrigé : **32 → 8 µs** par vérification.

---

## 11. Endpoints (mesures unitaires, base de mesure)

Durée « à froid » (premier appel, caches vides) puis « à chaud ». Extrait ; le tableau complet
des 52 endpoints est reproductible avec `scripts/perf/requetes-par-endpoint.js`.

| Endpoint | SQL | À chaud avant → après (ms) | À froid avant → après (ms) | Réponse |
|---|---:|---:|---:|---:|
| `GET /admin/paiements` | 3 | **248 → 15** | **190 → 13** | 30 Ko |
| `GET /admin/avis` | 3 | **85 → 9** | **88 → 9** | 9,6 Ko |
| `GET /admin/factures/export` | 2 | **952 → 281** | **1 128 → 292** | 1,5 Mo |
| `GET /admin/paiements/export` | 2 | **1 517 → 269** | **1 141 → 274** | 1,8 Mo |
| `GET /admin/colis/export` | 2 | 1 078 → 965 | 2 395 → 1 076 | 1,8 Mo |
| `GET /admin/dashboard/kpis` (depuis 2000) | 1 à 10 | 6 (cache) | **834** | 0,8 Ko |
| `GET /admin/dashboard/marketing` (depuis 2025) | 1 à 7 | 5 (cache) | **1 003** | 23 Ko |
| `GET /admin/dashboard/conversion` | 1 à 5 | 4 (cache) | **769** | 0,6 Ko |
| `GET /admin/colis?page=5000` | 4 | 136 → 124 | 143 → 159 | 60 Ko |
| `POST /auth/login` | 4 | 268 → 253 | 241 → 268 | 1,7 Ko |
| `GET /admin/colis/:id` (colis lourd) | 6 | 40 → 27 | 34 → 31 | 26 Ko |
| `GET /client/colis` | 4 | 15 | 28 | 30 Ko |
| `POST /public/visites` | 1 | 4 | 5 | 0,1 Ko |
| `GET /public/suivi/:ref` | 1 | 9 | 12 | 4 Ko |

**Plus coûteux sous charge**, par ordre décroissant :

1. connexion (CPU bcrypt) ;
2. exports ;
3. indicateurs marketing, conversion et KPI sur longue période ;
4. listes admin (payload de 60 Ko par page) ;
5. détail d'un colis.

**Payloads** : les listes renvoient des colis complets (~3 Ko par élément). C'est la
sérialisation, et non PostgreSQL, qui limite le profil client (§27). Une réduction (DTO de
liste) change le contrat des applications : non faite, recommandée (P2).

---

## 12 et 13. Contrôleurs et appels asynchrones

- Les contrôleurs sont minces. Aucun `await` séquentiel indépendant coûteux n'a été relevé sur
  les chemins chauds. Les parallélisations existantes (`Promise.all` des statistiques, 2 à
  3 requêtes) restent sous la taille du pool.
- Les envois en masse restent séquentiels **par choix** : chaque événement est pris sous verrou.
- `relancerEchues` (P3) et `notifierAdmins` (P4) : voir §4.

---

## 14. Appels externes

| Prestataire | Délai | Réessai | Coupe-circuit | Constat |
|---|---|---|---|---|
| SMTP | 10 s connexion, 30 s socket, pool de 3 | **Aucun, avant** | Non | **Corrigé** : 3 tentatives (maintenant, +2 s, +8 s) sur les erreurs passagères (réseau, 4xx) ; une adresse refusée (5xx) n'est pas retentée |
| FCM (push) | 10 s | Non | Non | Jetons invalides (404 UNREGISTERED) jamais retirés (P4) ; jeton OAuth sans anti-ruée (P4) |
| WhatsApp | 10 s | Non | Non | P3 si les messages deviennent contractuels |
| Cloudinary | Avant la transaction de déclaration | — | — | Correct. Nettoyage des fichiers orphelins en cas d'échec |

**File d'envois partagée** (mesuré, délai réduit à 1 s pour l'essai) :

- 20 push vers un FCM muet retardaient un email de **5 009 ms**. Avec le vrai délai de 10 s,
  cela ferait 50 s pour un code de réinitialisation, et plus de 12 min derrière un conteneur
  de 300 colis.
- **Corrigé** : une voie par canal. L'email part désormais en **1 ms** dans le même essai.
- **Reste P2** : la file n'est **pas durable**. Un envoi en attente est perdu si le processus
  est tué (OOM, SIGKILL, redéploiement brutal).

---

## 15. Transactions

- Aucune transaction ne contient d'appel externe : les téléversements Cloudinary sont faits
  avant la transaction, les envois passent par la file après validation.
- Les transactions sont courtes : moins de 10 requêtes indexées.
- `compte.pseudonymiser` calculait bcrypt (~250 ms) **sous le verrou** du compte. **Corrigé** :
  empreinte calculée avant la transaction.
- **Limite connue de Sequelize 6** : ses crochets `afterCommit` s'exécutent aussi quand
  l'instruction COMMIT elle-même échoue (perte de connexion à cet instant). Cas rarissime,
  documenté dans `utils/transactions.js`.

## 16. Verrous et interblocages

- Les verrous de ligne sont pris dans un ordre constant : colis puis factures, paiement puis
  facture, rotation puis colis.
- Aucun scénario « A attend B, B attend A » n'a été trouvé à la relecture ni observé en charge
  (0 attente de verrou dans `pg_stat_activity`).
- Les écritures concurrentes sur un **même** colis sont sérialisées (coût mesuré à l'audit
  précédent : −18 à −23 % sur ce seul scénario).

## 17 à 19. Contraintes, types, JSONB

- **Contraintes** : clés étrangères présentes ; unicité en base sur les références, l'email, le
  téléphone, `factures.colisId`, un avis par colis (index unique partiel). L'unicité de
  l'« avis général » par client n'est garantie que par le code (P4).
- **Types** :
  - identifiants UUID ; montants `DECIMAL(12,2)` (pas de flottant) ;
  - dates `TIMESTAMPTZ`, et `DATEONLY` pour les échéances ;
  - aucun mauvais choix relevé.
- **JSONB** (`detailTarification`, `lignes`, `horaires`, `infosCollecte`…) :
  - des documents figés à l'émission, jamais filtrés en SQL : aucun index GIN nécessaire ;
  - leur poids (~8 Ko par colis complet) justifie de ne lire que les colonnes utiles dans les
    listes et les exports (fait pour les exports).

## 20. Cache

- **Existant** : paramètres, FAQ publique (5 min), tableau de bord (60 s, anti-ruée),
  authentification (30 s). Aucun besoin mesuré de Redis pour le cache : PostgreSQL n'est pas
  le goulot des profils client et public (≤ 0,5 cœur).
- **Limite** : ce cache est **local à chaque processus**.
  - En multi-instance, une invalidation (paramètres, désactivation d'un compte) n'atteint pas
    les autres processus avant l'expiration : jusqu'à 30 s pour un compte désactivé.
  - P3, à reconsidérer avec plusieurs instances.

## 21. HTTP / Express

- Déjà corrects : `compression`, keep-alive 65 s (au-delà des 60 s de Nginx), `requestTimeout`
  120 s, corps JSON limité à 1 Mo, erreurs traduites sans pile en production, Helmet.
- `/health` et `/ready` ne sont pas journalisés.
- Aucun middleware coûteux global : le plus lourd est la vérification JWT, désormais 8 µs.

## 22. Authentification

- **Chaque requête authentifiée** fait : vérification JWT, 1 requête sur la liste de
  révocation (indexée, 200 000 lignes, < 1 ms), et le compte (cache de 30 s).
- **bcrypt coût 12** : ~250 ms de CPU par connexion. Plafond mesuré : 15 connexions/s sur
  4 cœurs.
  - Sur le conteneur de production (1 vCPU), le plafond est d'environ **4 connexions/s** :
    100 personnes qui se connectent dans la même minute font 25 s de CPU.
  - Le plafond de concurrence protège désormais le reste de l'API.
  - Réduire le coût à 11 (avec re-hachage à la connexion) diviserait ce coût par 2 : décision
    de sécurité à prendre, non appliquée.
- Le refresh token (7 jours, sans bcrypt) évite la plupart des reconnexions des applications.

## 23. Limitation de débit

Constats mesurés en `NODE_ENV=production` :

1. **Un seul compteur** « auth » (10 / 15 min par IP) était partagé par la connexion,
   l'inscription, la confirmation d'email, le mot de passe oublié **et le suivi public**.
   - **10 consultations de suivi** depuis une IP y **bloquaient la connexion 15 min** (mesuré :
     429).
2. Les connexions **réussies** étaient comptées : la **11e personne** à se connecter derrière
   une même IP recevait 429 (mesuré). Or les opérateurs mobiles partagent une IP publique
   entre de nombreux clients (NAT), comme un bureau.
3. Le plafond **global** (1 000 / 15 min) était compté **par IP**, et donc partagé par tous les
   utilisateurs derrière une même adresse.

**Corrections** (test `tests/integration/limitesDebit.test.js`, qui échoue sur l'ancien code) :

- Compteurs séparés : connexion, inscription et codes, suivi public (30 / 15 min, freine
  l'énumération de numéros séquentiels), mesure d'audience (par visiteur).
- Connexion :
  - seuls les **échecs** comptent ;
  - 10 échecs par IP + identifiant, et 50 échecs par IP tous comptes confondus ;
  - la protection anti force brute est vérifiée : le 11e essai reçoit 429, même avec le bon
    mot de passe.
- Plafond global **par compte connecté** (signature vérifiée), par IP pour les requêtes
  anonymes.
- Multi-instance : store Redis déjà branché (compose).

**Reste P2** : `deploy/nginx.conf` limite `/api/v1/` à **20 req/s par IP** (rafale 40) et
l'authentification à 10 req/min par IP.

- Tous les utilisateurs d'un même NAT partagent ces 20 req/s.
- À relever, ou à clé par jeton (`$http_authorization`) pour le trafic authentifié.

## 24. Journalisation

- winston en JSON, identifiant de requête, niveaux `warn` pour les 4xx et `error` pour les 5xx,
  corps expurgé, jetons masqués dans les URL : correct.
- **Volume mesuré** : ~235 octets par requête. À 245 req/s soutenues, cela fait ~200 Mo/h,
  alors que Docker garde 5 × 20 Mo, soit **~30 min d'historique**. P3 : envoyer les journaux
  vers un collecteur, ou échantillonner le journal `http` des 2xx rapides.
- `stdout` vers un tube est **synchrone** sous Linux : un collecteur lent ralentit la boucle
  d'événements (P4, non mesuré).

## 25. Erreurs

- Gestionnaire global correct :
  - 503 sur pool saturé ou `statement_timeout` ;
  - 409 sur violation d'unicité ;
  - aucune pile exposée en production.
- `unhandledRejection` et `uncaughtException` font `process.exit(1)` **immédiatement**, sans
  vider les requêtes en cours ni la file d'envois (P3). Pour `unhandledRejection`, préférer
  l'arrêt gracieux existant (`arreter()`).

## 26. Docker / production

- **Correct** : image multi-étapes, `npm ci --omit=dev`, utilisateur non root, système de
  fichiers en lecture seule, HEALTHCHECK sur `/ready`, `exec node` (SIGTERM reçu), arrêt
  gracieux de 20 s, tas V8 borné à 384 Mo, rotation des journaux.
- **Limites** :
  - **P1** : l'API tourne sur **1 processus, 1 vCPU**. C'est le plafond de capacité (§27-28).
  - **P2** : PostgreSQL est limité à 512 Mo, avec les réglages par défaut (`shared_buffers`
    128 Mo, `work_mem` 4 Mo, aucun réglage d'autovacuum, `pg_stat_statements` absent). Non
    mesurable sans la production.
  - **P1** : le **déploiement automatique échoue**. Les secrets `VPS_HOST`, `VPS_USER`,
    `VPS_SSH_KEY` et `PROJECT_PATH` sont absents du dépôt GitHub, donc rien n'est déployé par
    la CI.

---

## 27. Tests de charge

### Protocole

- Trois profils, avec une IP différente par requête (utilisateurs réels) :
  - **client** : liste, détail et suivi de colis, notifications, mesure d'audience, contenus
    publics, avec 500 comptes différents ;
  - **admin** : listes colis, factures, paiements et comptes, détail, recherche, tableau de
    bord ;
  - **public** : mesure d'audience, avis, FAQ, suivi par numéro.
- 20 s par essai, serveur redémarré à chaque essai, `NODE_ENV=production`, journaux actifs.
- Une « connexion » autocannon enchaîne les requêtes **sans temps de réflexion** : c'est une
  charge beaucoup plus dure qu'un utilisateur réel.
- autocannon fournit p50, p90, p97,5 et p99 : **p95 non mesuré**.

### Résultats : 1 processus, pool de 10 (configuration de production), avant → après

Colonnes de latence en millisecondes. « Node » et « PG » : CPU moyen, en % d'un cœur.

| Profil | Connexions | req/s | p50 | p97,5 | p99 | Erreurs | Node | PG | RSS max (Mo) | Connexions PG |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| client | 10 | 240 → 229 | 39 → 39 | 96 → 113 | 108 → 126 | 0 → 0 | 102 → 99 | 45 → 43 | 225 → 223 | 10 → 10 |
| client | 50 | 246 → 255 | 204 → 198 | 397 → 342 | 496 → 375 | 0 → 0 | 111 → 111 | 49 → 48 | 267 → 280 | 10 → 10 |
| client | 100 | 248 → 248 | 410 → 403 | 692 → 720 | 770 → 856 | 0 → 0 | 112 → 111 | 50 → 51 | 279 → 283 | 10 → 10 |
| client | 500 | 238 → 239 | 2 085 → 2 084 | 3 440 → 3 532 | 3 673 → 3 825 | 0 → 0 | 112 → 111 | 51 → 49 | 317 → 324 | 10 → 10 |
| admin | 10 | **91 → 133** | 91 → 72 | 322 → 158 | 390 → 177 | 0 → 0 | 69 → 91 | **254 → 139** | 225 → 225 | 10 → 10 |
| admin | 50 | **97 → 125** | 538 → 401 | 859 → 634 | 917 → 717 | 0 → 0 | 77 → 95 | **239 → 136** | 275 → 270 | 10 → 10 |
| admin | 100 | **95 → 125** | 1 040 → 785 | 1 733 → 1 575 | 2 630 → 2 086 | 0 → 0 | 76 → 97 | **247 → 136** | 286 → 277 | 10 → 10 |
| admin | 500 | **83 → 124** | 4 889 → 3 585 | 8 548 → 5 841 | 8 601 → 6 049 | 0 → 0 | 74 → 96 | **235 → 138** | 331 → 342 | 10 → 10 |
| public | 10 | 616 → 559 | 14 → 14 | 66 → 84 | 75 → 93 | 0 → 0 | 99 → 95 | 71 → 64 | 263 → 259 | 10 → 10 |
| public | 50 | 637 → 624 | 78 → 78 | 150 → 168 | 171 → 191 | 0 → 0 | 104 → 103 | 73 → 68 | 284 → 290 | 10 → 10 |
| public | 100 | 664 → 657 | 157 → 158 | 259 → 274 | 288 → 298 | 0 → 0 | 113 → 111 | 79 → 72 | 294 → 294 | 10 → 10 |
| public | 500 | 654 → 639 | 832 → 851 | 1 149 → 1 231 | 1 420 → 1 358 | 0 → 0 | 114 → 113 | 74 → 72 | 333 → 334 | 10 → 10 |

**Lecture** :

- **Aucune erreur**, jusqu'à 500 connexions, avant comme après.
- Le serveur ne tombe pas : il **met les requêtes en file**. Le débit reste constant et la
  latence croît linéairement avec la concurrence (loi de Little). À 500 connexions, un écran
  client attend 2 s en médiane.
- **Client et public** : le processus Node est saturé (~100 % d'un cœur), PostgreSQL à moins
  d'un demi-cœur.
  - Les écarts avant/après (−9 % à +4 %) sont dans la variance entre essais.
  - Une comparaison alternée ancien/nouveau code sur la même base donne 533-544 contre
    510-513 req/s pour le profil public, un écart inférieur à la variance de ±10 %.
  - Aucun gain ni aucune perte n'est démontré sur ces profils : aucune correction ne les
    visait.
- **Admin** : c'était **PostgreSQL** qui saturait (2,5 cœurs). Après les index et le comptage
  sans jointure : **+29 à +49 % de débit**, PostgreSQL divisé par 1,8, p99 à 500 connexions
  de 8,6 s à 6,0 s.

### Plusieurs processus (même machine de 4 cœurs, qui porte aussi le générateur et la base)

| Profil client | 1 processus | 3 processus |
|---|---:|---:|
| 100 connexions | 248 req/s, p50 410 ms | **484 req/s, p50 200 ms** |
| 500 connexions | 238 req/s, p50 2 085 ms | **545 req/s, p50 826 ms** |

Le débit monte avec le nombre de processus : la limite actuelle est le **processus Node
unique**, pas la base.

### Rafales ciblées

| Scénario | Avant | Après |
|---|---|---|
| 40 connexions simultanées (bcrypt) : effet sur une lecture publique | 1 491 → **4 req/s**, p50 **2 439 ms** | 1 491 req/s, p50 5 ms |
| 10 / 40 annulations simultanées | 30 s, 7 / 36 × 503 | 0,34 / 0,71 s, 0 erreur |
| 30 envois de 20 Mo simultanés | 568 Mo (> 512 Mo : OOM en production) | 296 Mo |

---

## 28. Capacité estimée

**Hypothèse de conversion** : un utilisateur actif de l'application fait en moyenne une requête
toutes les 5 s (écran, puis mesure d'audience, puis lecture). Cette hypothèse n'est pas
mesurée : les journaux de production permettraient de la vérifier.

| Charge (connexions sans pause) | Résultat | Latence p50 / p99 | Erreurs | Base | CPU Node | RAM | Statut |
|---|---|---|---|---|---|---|---|
| 10 | 133-559 req/s selon le profil | 14-72 / 93-177 ms | 0 | 10 connexions, ≤ 1,4 cœur | 1 cœur saturé | 223-259 Mo | Confortable |
| 50 | 125-624 req/s | 78-401 / 191-717 ms | 0 | ≤ 1,4 cœur | Saturé | 270-290 Mo | Acceptable (p99 < 1 s) |
| 100 | 125-657 req/s | 158-785 / 298-2 086 ms | 0 | ≤ 1,4 cœur | Saturé | 277-294 Mo | Dégradé côté admin |
| 500 | 124-639 req/s | 851-3 585 / 1 358-6 049 ms | 0 | ≤ 1,4 cœur | Saturé | 324-342 Mo | **Inacceptable** (secondes d'attente), sans erreur |

**Estimation (1 processus, sur cette machine)** :

- le profil client plafonne à **~240 req/s**, soit environ **1 200 utilisateurs actifs
  simultanés** avec l'hypothèse ci-dessus, et une latence qui reste sous 0,5 s tant que le
  débit demandé reste sous ce plafond ;
- le back-office plafonne à **~125 req/s**.

**En production** (1 vCPU plafonné par Docker, processeur inconnu), le plafond est **au plus**
celui-ci, et **nettement plus bas pendant une rafale de connexions** (bcrypt).

**Pas de chiffre pour 1 000 connexions** : non testé, la machine de mesure ne le permet pas
(générateur et serveur sur les mêmes 4 cœurs).

---

## 29. Tableau principal des problèmes

« Corrigé » = corrigé sur la branche, mesuré et testé. Les autres statuts restent à faire.

| Priorité | Catégorie | Problème | Fichier | Fonction / ligne | Impact | Risque sous charge | Correction | Statut |
|---|---|---|---|---|---|---|---|---|
| P0 | Pool / transactions | Effets de bord d'un événement de suivi lancés dans la transaction de l'appelant : chaque requête prend une 2e connexion | `modules/colis/service/suivi.service.js`, `utils/referenceGenerator.js` | `enregistrerEvenement`, `creerSequence` | 10 annulations simultanées : API bloquée 30 s, 7 × 503 | Toute l'API figée dès que N ≥ taille du pool | `apresCommit` (après COMMIT, connexion rendue) ; séquence créée dans la transaction | **Corrigé** |
| P1 | Cohérence | Notification et email envoyés avant le COMMIT | idem | idem | Client prévenu d'un événement annulé (mesuré : 1 notification fantôme) | Proportionnel aux échecs de transaction | idem | **Corrigé** |
| P1 | Concurrence / argent | Résolution de réclamation sans verrou | `modules/reclamation/service/reclamation.service.js` | `resoudre` | Deux avoirs d'indemnisation (mesuré) | Double clic, deux agents | Statut relu `FOR UPDATE` | **Corrigé** |
| P1 | Concurrence / argent | Avoirs sans contrôle du cumul ni verrou | `modules/facture/service/facture.service.js` | `emettreAvoir` | 120 % d'une facture compensés (mesuré) | Même en séquentiel | `factureOrigineId`, verrou, cumul | **Corrigé** |
| P1 | Débit | Compteur « auth » partagé avec le suivi public | `middlewares/rateLimit.middleware.js` | `authRateLimit` | 10 suivis bloquent la connexion 15 min (mesuré) | Toute IP partagée | Compteurs séparés | **Corrigé** |
| P1 | Débit | Connexions réussies comptées ; plafond global par IP | idem | `authRateLimit`, `globalRateLimit` | 11e connexion derrière un NAT refusée (mesuré) | Réseaux mobiles, bureaux | Échecs seulement ; global par compte | **Corrigé** |
| P1 | Mémoire | Fichiers gardés en mémoire sans plafond de concurrence | `middlewares/upload.middleware.js` | `upload`, `uploadColis` | 568 Mo pour 30 envois, au-delà de la limite de 512 Mo (OOM) | Pic de déclarations avec photos | Plafond de réceptions simultanées | **Corrigé** |
| P1 | CPU | bcrypt sans plafond de concurrence | `modules/auth/service/auth.service.js` | `login`, `register`… | Lectures 1 491 → 4 req/s pendant une rafale de connexions (mesuré) | Heure de pointe | `utils/motDePasse.js` (plafond) | **Corrigé** (capacité de connexion inchangée) |
| P1 | Capacité | 1 processus Node, 1 vCPU | `docker-compose.prod.yml` | `backend.deploy` | Plafond ~240 req/s client, ~125 admin ; latence linéaire au-delà | 500 connexions : p50 2-3,6 s | 2 à 4 processus (PM2 ou répliques) + Redis déjà en place ; ajuster `DB_POOL_MAX` | À faire (déploiement) |
| P1 | Production | Déploiement CI en échec (secrets VPS absents) | `.github/workflows` | job deploy | Rien n'est déployé | — | Renseigner `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `PROJECT_PATH` | À faire (propriétaire du dépôt) |
| P2 | Index | Tri sans index : listes admin paiements et factures, file des avis | `paiements`, `factures`, `avis` | `getAllPaiements`, `getAllFactures`, modération | 212 / 168 / 81 ms, proportionnels au volume | PostgreSQL saturé (2,5 cœurs) en back-office | Index `createdAt` (CONCURRENTLY) | **Corrigé** |
| P2 | Index | `lower(email)` sans index fonctionnel | `modules/auth/service/auth.service.js` | `trouverParEmail` | Seq Scan des comptes à chaque connexion | Croît avec le nombre de comptes | Index `lower(email)` | **Corrigé** |
| P2 | SQL | `COUNT(DISTINCT)` joint sur toute la table (listes factures et paiements) | `facture.service`, `paiementAdmin.service` | `getAll*` | 24-42 ms pour 40 000 factures, linéaire | Back-office | `listerPagine` | **Corrigé** |
| P2 | Boucle d'événements | Exports factures et paiements : lignes complètes et instances | `facture.service`, `paiementAdmin.service` | `exporterCsv` | 0,9-1,5 s de blocage | Tout le processus figé pendant l'export | Colonnes utiles, lignes brutes | **Corrigé** (0,27 s) |
| P2 | Envois externes | File unique pour tous les canaux, sans réessai | `utils/arrierePlan.js`, `infrastructure/mailer.js` | `lancer`, `sendMail` | Email retardé par un FCM en panne (mesuré) ; email perdu sur erreur passagère | Panne d'un prestataire | Voie par canal ; 3 tentatives SMTP | **Corrigé** |
| P2 | Concurrence | Statut de conteneur changé deux fois | `modules/rotation/service/rotation.service.js` | `changerStatut` | Événements et notifications en double (mesuré) | Double clic | UPDATE conditionnel, 409 | **Corrigé** |
| P2 | Fiabilité | File d'envois non durable | `utils/arrierePlan.js` | — | Emails et push perdus si le processus est tué | Redéploiement, OOM | Table de jobs ou file Redis persistante | À faire |
| P2 | CPU / API | Listes renvoyant des colis complets ; ~45 % du CPU dans Sequelize | `colisClient.service`, `colisAdmin.service` | `getMesColis`, `getAllColis` | 30-60 Ko par page | Plafond CPU du profil client | DTO de liste (colonnes utiles), à valider avec le mobile et l'admin | À faire (contrat) |
| P2 | Base | PostgreSQL non réglé, 512 Mo, sans `pg_stat_statements` | `docker-compose.prod.yml` | `postgres` | Tris sur disque (`work_mem` 4 Mo) | Tableaux de bord, croissance | `shared_buffers`, `work_mem`, autovacuum, `pg_stat_statements` | À faire |
| P2 | Débit | Nginx : 20 req/s et 10 connexions/min par IP | `deploy/nginx.conf` | `limit_req_zone` | Tous les utilisateurs d'un NAT partagent 20 req/s | Réseaux mobiles | Relever, ou clé par jeton | À faire |
| P2 | Configuration | PM2 `instances: max` × `DB_POOL_MAX` peut dépasser `max_connections` | `ecosystem.config.js` | `instances` | « too many clients » | Hôte de plus de 10 cœurs | Fixer `PM2_INSTANCES` (documenté) | Documenté |
| P2 | Observabilité | Aucune métrique ni APM ; journaux perdus au-delà de ~30 min à 245 req/s | — | — | Incident indiagnosticable | Toute montée en charge | Métriques (latence, pool, file), collecte des journaux | À faire |
| P3 | SQL | Marketing, conversion et KPI sur longue période : `COUNT(DISTINCT)` trié sur disque | `mesure/service/*`, `dashboard.service` | `statistiques`, `kpis` | 0,8-1 s à froid par plage | Plusieurs admins, plages différentes | Agrégats quotidiens | À faire |
| P3 | Pagination | OFFSET profond (page 5 000) | `colisAdmin.service` | `getAllColis` | 124-159 ms | Parcours profond | Pagination par curseur (contrat) | À faire |
| P3 | SQL | Recherche de comptes `ILIKE '%…%'` sur 5 colonnes | `admin/service/user.service.js` | `getAllUsers` | Seq Scan, 33 ms pour 20 000 comptes | Croissance des comptes | Index trigrammes | À faire |
| P3 | SQL | Parrainage : tri par comptage pour tous les comptes | `admin/service/parrainage.service.js` | liste | Calcul complet à chaque page | Croissance des comptes | Compteur maintenu ou vue | À faire |
| P3 | Requête longue | Relance groupée des échues, séquentielle, dans la requête HTTP | `facture.service.js` | `relancerEchues` | ~3 requêtes par facture, non borné (revue de code) | Milliers d'échues : délai du proxy | Tâche de fond, lots | À faire |
| P3 | Boucle d'événements | Export des colis ~1 s ; exports tronqués à 10 000 sans signal | `colisAdmin.service.js` | `exporterCsv` | 1 s de blocage | Exports simultanés | Flux (curseur + stream), en-tête « tronqué » | À faire |
| P3 | Rétention | `notifications` et `activity_logs` sans purge | — | — | Croissance illimitée | Index et VACUUM plus lourds | Tâche de purge ou d'archivage | À faire |
| P3 | Journaux | ~235 o/requête ; rotation 100 Mo | `docker-compose.prod.yml` | `logging` | ~30 min d'historique en charge | Perte des traces d'incident | Collecteur, échantillonnage des 2xx | À faire |
| P3 | Robustesse | `unhandledRejection` : `exit(1)` sans drainage | `src/server.js` | gestionnaires `process.on` | Requêtes et envois en cours perdus | Toute promesse rejetée non gérée | Passer par `arreter()` | À faire |
| P3 | Cache | Cache local par processus (compte désactivé valable 30 s ailleurs) | `utils/cache.js`, `utils/jwtUtils.js` | — | Invalidation non partagée | Multi-instance | Invalidation par Redis (pub/sub) si nécessaire | À faire |
| P3 | Transactions | bcrypt calculé sous le verrou du compte | `compte.service.js` | `pseudonymiser` | 250 ms de verrou et de connexion | Faible | Calcul avant la transaction | **Corrigé** |
| P4 | CPU | Secret JWT converti à chaque vérification | `config/security.js` | `jwtConfig` | 32 µs par requête | — | `createSecretKey` une fois (8 µs) | **Corrigé** |
| P4 | N+1 | `notifierAdmins` : 2 requêtes par admin | `notification.service.js` | `notifierAdmins` | Faible | — | `bulkCreate` | À faire |
| P4 | Envois externes | Jetons FCM invalides jamais retirés ; jeton OAuth sans anti-ruée | `infrastructure/push.js` | `envoyerPush` | Appels inutiles | — | Retirer le jeton sur 404 ; `memoiser` | À faire |
| P4 | Maintenance | Purge des visites en un seul DELETE | `visite.service.js` | `purger` | Risque de `statement_timeout` sur un gros arriéré | — | Suppression par lots | À faire |
| P4 | Contraintes | Avis général unique garanti par le code seulement | `avis.service.js` | `deposer` | Doublon possible en course | — | Index unique partiel | À faire |
| P4 | Architecture | Tâches planifiées dans le processus web | `jobs/taches.js` | — | Partage du CPU avec le trafic | — | Processus dédié si elles grossissent | À faire |
| P4 | Journaux | `stdout` synchrone vers le tube Docker | `utils/logger.js` | — | Non mesuré | Collecteur lent | Transport asynchrone | À faire |
| P4 | N+1 | Import des jours fériés : 2 requêtes par jour | `jourFerie.service.js` | `importerCalendrier` | ~30 par an | — | `bulkCreate` + `ignoreDuplicates` | À faire |
| P4 | Documentation | Commentaire PM2 obsolète (`src/jobs/index.js`) | `ecosystem.config.js` | — | Trompeur | — | Réécrit | **Corrigé** |

## 30. État par domaine

| Domaine | État | Problèmes critiques restants | Commentaire |
|---|---|---|---|
| Architecture | Bon | — | Couches nettes. Les effets après COMMIT sont désormais centralisés |
| Node.js | Moyen | Capacité (1 processus) | CPU saturé par la sérialisation ORM ; bcrypt maîtrisé |
| Express | Bon | — | Délais, limites, erreurs corrects |
| PostgreSQL | Moyen | Réglages, métriques | Jamais saturé côté client ; non réglé pour la production |
| SQL | Bon | — | Paramétré, pas de N+1 en lecture ; agrégats marketing lourds (P3) |
| Index | Bon | — | 4 index manquants ajoutés, justifiés par EXPLAIN |
| N+1 | Bon | — | Boucles restantes bornées ou métier |
| Transactions | Bon (après correction) | — | Le P0 est corrigé ; transactions courtes, sans appel externe |
| Concurrence | Bon (après correction) | — | 3 courses corrigées et testées ; 0 attente de verrou |
| Mémoire | Bon (après correction) | — | Envois bornés, stable sous charge |
| Boucle d'événements | Moyen | Export des colis (1 s) | bcrypt et exports factures et paiements traités |
| API | Moyen | Payloads complets | Contrat à faire évoluer avec les clients |
| Docker | Moyen | 1 vCPU, déploiement en échec | Image et sécurité correctes |
| Observabilité | Insuffisant | Aucune métrique | Journaux seuls, rotation courte |

## 31. Plan de correction

**Phase 1 — Urgent**

Fait sur la branche :

- pool et effets après COMMIT ;
- courses sur réclamations, avoirs et conteneurs ;
- limitation de débit ;
- plafond des envois ;
- plafond bcrypt.

Reste :

1. Rétablir le déploiement (secrets GitHub).
2. Passer à **2-4 processus** (répliques Compose ou PM2), avec
   `processus × DB_POOL_MAX < max_connections − marge`, et Redis déjà en place pour les
   limiteurs.
3. Relever la limite Nginx par IP.

**Phase 2 — Performance**

Fait : index, comptage des listes, exports factures et paiements.

Reste :

1. DTO de liste pour le mobile et l'admin (contrat).
2. Réglage de PostgreSQL et `pg_stat_statements`.
3. Export des colis en flux.
4. Agrégats quotidiens marketing et conversion.

**Phase 3 — Scalabilité**

1. File d'envois durable (table de jobs ; Redis/BullMQ seulement si le volume l'exige).
2. Tâches planifiées dans un processus dédié si elles grossissent.
3. Invalidation de cache partagée si le multi-instance rend les 30 s gênantes.
4. Pagination par curseur si le back-office parcourt des milliers de pages.

**Phase 4 — Optimisation**

Points P4 du tableau, rétention des notifications et journaux, collecte des journaux.

## 32 à 34. Corrections et non-régression

- Pour chaque correction : le problème, le code avant et après, et la mesure figurent aux §2
  à §27 et dans le message du commit `f0c67f7`.
- **Tests** : **682/682** (669 existants + 13 nouveaux).
  - Les **13 nouveaux échouent sur l'ancien code** (vérifié en réappliquant l'ancien code) :
    pool, notification fantôme, réclamation, avoirs, conteneur, 4 tests de débit, 2 de
    plafond d'envois, 2 de file d'envois.
- **Contrats d'API** : inchangés, à trois nuances près.
  - Nouveaux codes : 409 (conteneur modifié entre-temps), 503 (envoi de fichier en attente
    trop longue), 400 (avoir au-delà du reste compensable).
  - Champ ajouté : `factureOrigineId` dans les factures (ajout, non cassant).
  - Ordre des listes factures et paiements départagé par `id` : les pages ne se recouvrent
    plus.
- **Exports** : contenu identique octet pour octet (vérifié).
- **Migrations** : aller, retour et rejeu sur base neuve ; rattachement des avoirs existants
  vérifié ; `schema:verifier` conforme aux 40 modèles, sur base neuve et sur la base de mesure.
- **Détecteur de transactions** : 0 occurrence sur toute la suite (61 avant).
- `npm run lint` et `format:check` : OK.

---

## 35. Rapport final

### A. Nombre de problèmes

| Priorité | Total | Corrigés | Restants |
|---|---:|---:|---:|
| P0 | 1 | 1 | 0 |
| P1 | 9 | 7 | 2 |
| P2 | 12 | 6 | 6 (dont 1 documenté) |
| P3 | 11 | 1 | 10 |
| P4 | 9 | 2 | 7 |

### B. Problèmes au plus fort impact

1. Épuisement du pool par les transactions de suivi (P0) : API figée 30 s par 10 requêtes.
   Corrigé.
2. Capacité d'un seul processus à 1 vCPU (P1) : ~240 req/s client, latence de plusieurs
   secondes au-delà. À faire.
3. bcrypt sans plafond (P1) : API figée pendant les rafales de connexions. Corrigé.
4. Envois de fichiers en mémoire (P1) : OOM du conteneur au-delà de ~25 envois simultanés.
   Corrigé.
5. Limitation de débit par IP (P1) : utilisateurs derrière un NAT bloqués. Corrigé côté
   Express ; reste la limite Nginx.
6. Doubles indemnisations et avoirs illimités (P1). Corrigé.

### C. Ce qui arrive quand le nombre d'utilisateurs augmente (après corrections)

- Jusqu'au plafond (~240 req/s client sur un processus), les réponses restent sous 0,5 s.
- Au-delà, rien ne casse : aucune erreur jusqu'à 500 connexions. Mais la latence croît
  linéairement et atteint plusieurs secondes.
- Aux heures de pointe de connexion, chaque connexion attend son tour (p50 de 4,1 s mesuré
  pendant une rafale de 40 connexions simultanées).
- En cas d'arrêt brutal du conteneur, les emails et notifications en attente sont perdus.
- Sans métriques, une dégradation ne sera vue qu'à travers les plaintes des utilisateurs.

### D. Corrections prioritaires, dans l'ordre

1. Fusionner cette branche (migrations `CONCURRENTLY`, sans interruption).
2. Rétablir le déploiement.
3. Passer à 2-4 processus et ajuster `DB_POOL_MAX`.
4. Relever la limite Nginx par IP.
5. Ajouter des métriques (latence, pool, file d'envois) et `pg_stat_statements`.
6. Régler PostgreSQL.
7. DTO de liste.
8. File d'envois durable.
9. Agrégats marketing.
10. Export des colis en flux.
11. Points P3 et P4 restants.

### E. Préparation à la montée en charge

| Axe | État |
|---|---|
| Architecture | Prête |
| Base de données | Prête pour le volume mesuré ; réglages de production à faire |
| API | Prête ; payloads lourds |
| Concurrence | Prête (courses connues corrigées et testées) |
| Mémoire | Prête |
| SQL | Prêt |
| Index | Prêts |
| Observabilité | **Non prête** |
| Déploiement | **Non prêt** (CI de déploiement en échec, 1 processus) |
| Tests de charge | Faits en local ; **à refaire sur l'infrastructure réelle** avec `scripts/perf/charge-profils.js` |

### F. Verdict technique

**Ce qui est performant**

- Lectures client et publiques : 1 à 5 requêtes indexées, 4 à 30 ms à l'unité.
- Aucune erreur jusqu'à 500 connexions simultanées.
- PostgreSQL loin de la saturation sur les profils client et public.
- Transactions courtes, sans appel externe.
- Mémoire stable.

**Ce qui ne l'était pas et l'est devenu**

- Le pool, bloqué par 10 requêtes simultanées.
- L'argent : doubles avoirs.
- Les notifications fantômes.
- Les limites de débit, qui excluaient les utilisateurs d'un NAT.
- La mémoire des envois de fichiers.
- bcrypt, qui figeait l'API.
- Le back-office : +29 à +49 % de débit.

**Ce qui limite aujourd'hui**

- Le **CPU d'un unique processus Node**, dont ~45 % est consommé par l'ORM pour sérialiser des
  objets complets.
- Le **déploiement** : 1 vCPU, CI en échec.

**À corriger avant une forte hausse du trafic**

- Plusieurs processus.
- Limite Nginx par IP.
- Métriques.
- Réglage de PostgreSQL.

**Ce qui peut attendre**

- DTO de liste, pagination par curseur, agrégats marketing, file durable : à décider selon le
  trafic réel, mesuré une fois les métriques en place.
