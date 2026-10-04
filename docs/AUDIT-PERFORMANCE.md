# AUDIT PERFORMANCE BACKEND — Yobnate Colis

Audit réalisé le 26/09/2026 sur la branche `claude/amazing-carson-4ya8x3`, à partir du commit
`ce71138`. Chaque correction a été mesurée avant/après, vérifiée à comportement identique
et couverte par les tests. Les chiffres sont ceux mesurés ; ce qui n'a pas pu l'être est
indiqué « Non mesuré ».

**Environnement de mesure (et ses limites)** — conteneur Linux 4 vCPU / 16 Go, Node.js 22.22,
PostgreSQL 16.13 local (même machine, aucune latence réseau), un seul processus Node, pool
de 10 connexions. Base de mesure `scripts/perf/seed.sql` : 20 000 utilisateurs, 200 000 colis,
600 000 pièces, 1 200 000 événements de suivi, 200 000 notifications, 40 000 factures,
200 000 lignes de journal, plus un colis « lourd » réaliste (10 pièces, 30 événements,
3 paiements, 10 articles douaniers). Le générateur de charge tournait sur la même machine
que le serveur et la base : les débits absolus sont inférieurs à ce qu'offrirait un serveur
dédié, seules les comparaisons avant/après sont significatives. Aucun chiffre ci-dessous
ne permet d'affirmer une capacité en nombre d'utilisateurs en production.

---

## 1. Architecture analysée

| Élément | Constat |
|---|---|
| Framework | Express 4.21, architecture routes → controllers → services → modèles |
| ORM | Sequelize 6.37 (`pg` 8.13), requêtes brutes ponctuelles (`sequelize.query`) |
| Node.js | 22 (Dockerfile `node:22-slim`), `engines >= 18` |
| PostgreSQL | 16 (docker-compose), extensions `uuid-ossp`, `pg_trgm` |
| Schéma | Modèles Sequelize ; migrations qui délèguent à `sync()` (voir §4) |
| Connexions | Un pool Sequelize par processus, `max 10` codé en dur, pas de timeout SQL |
| Transactions | Gérées (callback `sequelize.transaction`), mais **aucun verrou de ligne** |
| Cache | `Map` en mémoire par processus (dashboard 60 s, paramètres, auth 30 s), sans purge ni borne |
| Pagination | `limit/offset` (max 100) via `utils/paginate`, `findAndCountAll` |
| Logs | winston JSON en production, identifiant de requête (`X-Request-ID`) |
| Asynchrone | Tâches planifiées `setInterval` dans le processus serveur ; emails/push/WhatsApp **dans la requête HTTP** |
| Déploiement | Docker (compose prod) ou PM2 en cluster (`instances: max`), Nginx devant |

---

## 2. Problèmes critiques

| Problème | Fichier | Cause | Impact | Correction |
|---|---|---|---|---|
| Build de production cassé | `package-lock.json` | Lockfile désynchronisé de `package.json` | `npm ci` échoue : Dockerfile et CI inutilisables | Lockfile régénéré (npm 10, celui de Node 22) |
| Index UNIQUE recréés à chaque démarrage | `src/server.js` | `sequelize.sync()` au démarrage ; bug Sequelize/PostgreSQL qui recrée les contraintes `unique` des colonnes | +21 index à chaque démarrage (230 → 251 → 272 mesurés ; 418 sur la base de charge après 10 redémarrages) : chaque INSERT/UPDATE maintient N copies | `sync()` supprimé (schéma = migrations), migration de dédoublonnage |
| Produit cartésien sur le détail d'un colis | `services/admin/colis.service.js`, `services/client/colis.service.js` | 4 relations 1-N jointes dans une seule requête | 9 000 lignes pour un colis ; 1 686 ms ; sous 50-100 connexions, serveur à 2,4 Go et ne répondant plus, même à `/health` | `separate: true` sur les relations 1-N |
| Stock des points compté plusieurs fois | `services/suivi.service.js` | Lecture du statut puis écriture, sans verrou | 5 scans simultanés → 5 colis en stock au lieu de 1 (test) | `SELECT … FOR UPDATE` + contrôle refait sous verrou |
| Connexions simultanées refusées | `services/auth.service.js` | Deux connexions dans la même seconde → jetons identiques → violation d'unicité | 409 sur double tap / deux appareils : 139 connexions en échec sur 10 s en charge | `jwtid` aléatoire |
| Envois externes dans la requête HTTP | `utils/mailer.js`, `services/notification.service.js` | SMTP, FCM, WhatsApp attendus en ligne, sans timeout | Un scan de colis : 8 154 ms avec un SMTP lent ; conteneur de 300 colis au-delà du délai Nginx | File d'arrière-plan bornée, SMTP en pool avec délais, `fetch` avec timeout 10 s |
| Tâches planifiées dupliquées | `jobs/taches.js`, `utils/purgeExpiredTokens.js` | Chaque worker PM2 exécute les tâches | Relances de factures et alertes envoyées autant de fois qu'il y a de workers | Réservation atomique en base (`taches_planifiees`) |
| Dashboard qui sature le pool | `services/admin/dashboard.service.js` | 17 `COUNT` lancés en parallèle pour un pool de 10 | Un affichage de dashboard bloquait toutes les autres requêtes | 4 requêtes `FILTER`, cache anti-ruée |

---

## 3. N+1 détectés

| Endpoint / traitement | Requêtes SQL avant | Requêtes SQL après | Correction |
|---|---:|---:|---|
| `GET /admin/colis/:id` (colis lourd) | 3 (dont une de 9 000 lignes) | 7 (53 lignes au total) | Chargement séparé des relations 1-N. 1 686 ms → 32 ms |
| `GET /admin/colis/recherche/:num` | 5 | 9 | Idem. 1 947 ms → 40 ms |
| `GET /client/colis/:id` | 2 | 5 | Idem. 68 ms → 23 ms |
| `GET /client/colis/:id/suivi` | 3 (dont le détail complet pour un contrôle de propriété) | 3 (contrôle sur `id` seul) | 59 ms → 7 ms |
| `GET /admin/dashboard/stats` (à froid) | 19 | 6 | Agrégats `COUNT(*) FILTER`, un parcours par table |
| `GET /admin/dashboard/par-pays` (à froid) | 12 | 5 | 3 requêtes groupées par pays |
| `GET /admin/colis/statistiques` | 6 (4 parcours parallèles) | 1 parcours `GROUPING SETS` + 1 | 4 connexions → 1 ; cache 30 s |
| Annonce d'une tournée à 11 110 clients | 22 224 | 26 | Notifications par lots de 500 ; envois en file. 17,2 s → 0,98 s |
| Scan par lot (200 colis max) | 1 lecture par colis | 1 lecture pour le lot | Préchargement |
| Changement de statut d'un conteneur de 300 colis | Non mesuré (emails en ligne) | 3 005 requêtes, 2,4 s | Envois en file ; un événement (≈10 requêtes indexées) par colis conservé, chacun sous son verrou |

Le passage d'un conteneur reste en « 1 événement par colis » : c'est la règle métier (chaque
colis a son historique, ses stocks et ses notifications). Chaque événement est maintenant court
et sans appel externe.

---

## 4. PostgreSQL

### Index ajoutés — migration `20260926000001-performance-index` (CONCURRENTLY)

| Index | Justification (EXPLAIN ANALYZE, 200 000 colis) |
|---|---|
| `colis ("destinataireTelephone", "createdAt" DESC)` | Onglet « Reçus » : Parallel Seq Scan 20 ms → Index Scan 0,1 ms |
| `colis USING gin (reference gin_trgm_ops)` | `reference ILIKE '%…%'` : 83 ms → 0,6 ms (Bitmap Index Scan) |
| `suivi_colis ("colisPieceId") WHERE NOT NULL` | Clé étrangère non indexée : supprimer 3 pièces parcourait 1,2 M lignes, 239 ms → 0,4 ms |
| `colis ("dateLivraisonEstimee") WHERE statut NOT IN (terminés)` | Colis en retard : Seq Scan 40 ms → 0,1 ms (index partiel, colis en cours seulement) |
| `colis ("dateLimiteRetrait") WHERE statut = 'disponible_retrait'` | Colis en souffrance : 20 ms → 0,02 ms |
| `activity_logs ("createdAt")` | Journal et dernières activités : Seq Scan + tri 21 ms → 0,09 ms |

### Index supprimés

- Tous les doublons issus de `sync()` : 272 → 167 index sur la base de développement.
  Pour chaque groupe identique, on garde la clé primaire ou la contrainte d'origine.
- `colis_user_id`, `colis_statut` : préfixes stricts de `(userId, createdAt)` et
  `(statut, dateLivraisonEstimee)`.
- `suivi_colis_colis_id_created_at` : redondant avec `(colisId, dateEvenement)` sur la plus
  grosse table en écriture.

### Requêtes optimisées

- Listes de colis (`utils/paginate.listerPagine`) :
  - Avant : `COUNT(DISTINCT id)` avec 5 jointures sur toute la table, puis un OFFSET
    sur des lignes jointes de ~8 Ko.
  - Après : `COUNT(*)` sans jointure, puis les identifiants de la page, puis les lignes.
  - Ordre départagé par `id` : deux pages successives ne se recouvrent plus.
  - Mesures : page 1 de la liste admin, 92 → 33 ms ; page 5 000, 375 → 142 ms.
- Export CSV : seules les 19 colonnes exportées sont lues. 3,0-3,8 s → 1,3-1,4 s pour 10 000 lignes.
- Références métier : `CREATE SEQUENCE IF NOT EXISTS` (DDL qui verrouille le catalogue)
  exécuté une fois par processus, et non plus à chaque colis, facture ou enlèvement.

### Migrations

- Les migrations initiales délèguent à `sync()`. On les garde, pour ne pas réécrire
  l'historique déjà appliqué en production, mais `sync()` ne s'exécute plus hors migration.
- Les nouvelles migrations sont versionnées et idempotentes : `IF NOT EXISTS`, reconstruction
  d'un index `INVALID`, `down` fourni.
- Testées sur une base neuve, sur une base existante, en retour complet puis en rejeu.

---

## 5. Connection Pool

| | Avant | Après |
|---|---|---|
| Taille | `max: 10` codé en dur | `DB_POOL_MAX` (défaut 10) |
| Attente d'une connexion | 30 s | `DB_POOL_ACQUIRE_MS`, 15 s, puis **503** au lieu de 500 |
| Requête SQL interminable | Aucune limite | `statement_timeout` 30 s (`DB_STATEMENT_TIMEOUT_MS`), puis 503 |
| Transaction oubliée | Aucune limite | `idle_in_transaction_session_timeout` 60 s |
| Arrêt du serveur | Pool fermé pendant que des requêtes écrivaient encore (48 erreurs mesurées sous charge) | Attente de l'inactivité du pool (0 erreur) |
| PM2 cluster | Workers × 10 connexions, non documenté | Règle `workers × DB_POOL_MAX < max_connections` documentée |

Aucune fuite de connexion trouvée : pas d'usage de `pool.connect()` manuel, et toutes les
transactions sont gérées par callback (commit ou rollback automatique).

---

## 6. Transactions

- Aucun appel externe dans une transaction : les téléversements R2 sont faits avant
  la transaction de déclaration, et les notifications après le commit. C'était déjà le cas.
- Réessai de référence (`creerAvecReference`, émission de facture) :
  - Défaut : après une violation d'unicité, PostgreSQL annule toute la transaction, donc le
    réessai échouait systématiquement (« current transaction is aborted »).
  - Correction : chaque tentative a désormais son `SAVEPOINT`.
- Demande d'enlèvement : la création de la demande et la réservation de la place en tournée
  n'étaient pas dans la même transaction. Elles le sont maintenant.

---

## 7. Concurrence

| Race condition | Correction | Preuve |
|---|---|---|
| Deux événements simultanés sur un même colis (statut, stock des points) | `SELECT … FOR UPDATE`, état relu et transition recontrôlée sous verrou | Test e2e : 5 scans simultanés → stock 1 (5 avec l'ancien code) |
| Colis chargé en même temps sur deux conteneurs ; capacité dépassée ; compteurs divergents | Verrou de la rotation, `UPDATE … WHERE "rotationId" IS NULL RETURNING` | Test e2e : 1 seul chargement (2 avec l'ancien code) |
| Même refresh token rafraîchi deux fois | `DELETE` atomique qui consomme le jeton | Test e2e : 1 succès, 2 refus |
| Connexions simultanées d'un même compte | `jwtid` unique | Test e2e : 4/4 réussies (409 avec l'ancien code) |
| Crédit de parrainage dépensé deux fois | `UPDATE … WHERE "creditParrainage" >= montant` | Revue de code ; e2e parrainage vert |
| Remise « première expédition » obtenue deux fois | `UPDATE … WHERE "parrainageRecompense" = false` | Revue de code ; e2e vert |
| Reprise du crédit du parrain (lecture puis écriture) | `GREATEST(0, crédit - gain)` en SQL | Revue de code ; e2e vert |
| Tournée surréservée | `UPDATE … WHERE "nbInscrits" < "capaciteMax"` (déclaration et enlèvement) | Revue de code |
| Stock d'emballages négatif | `UPDATE … WHERE stock >= quantité` | Revue de code |
| Facture émise deux fois en parallèle | Unicité `colisId` + renvoi de la facture concurrente | Revue de code |
| Tâches planifiées exécutées par chaque worker | `UPDATE taches_planifiees … WHERE "derniereExecution" < créneau` | Test e2e : 6 réservations simultanées → 1 |
| Proposition acceptée pendant son expiration automatique | Traitement colis par colis ; transition refusée sous verrou | e2e catégorie 3 vert |

Contrepartie mesurée : 100 écritures simultanées **sur le même colis** sont désormais
sérialisées, ce qui coûte −18 à −23 % de débit sur ce scénario (voir §13). C'est le prix de
la justesse : avant, ces écritures produisaient des compteurs faux. Des écritures sur des colis
différents ne se bloquent pas entre elles.

---

## 8. Pagination

- Les listes volumineuses sont déjà bornées (`MAX_LIMIT` 100).
- Les tailles de liste du dashboard (`?limit=` sans borne) sont maintenant bornées à 100.
- Les listes de colis (admin, client, reçus) passent par `listerPagine` (§4).
- OFFSET profond conservé pour ne pas changer le contrat API : page 5 000 à 142 ms. Une
  pagination par curseur (`createdAt`, `id`) serait l'étape suivante si des clients
  parcourent réellement des milliers de pages.

## 9. Cache

- **Existant** : `Map` mémoire par processus, sans purge des clés expirées ni borne de taille,
  et sans protection contre la ruée (N requêtes recalculent en même temps à l'expiration).
- **Modifié** :
  - purge périodique (`unref`) et borne à 10 000 entrées ;
  - `memoiser()` : un seul calcul en vol par clé ;
  - cache ajouté sur les agrégats coûteux du dashboard (clients actifs, villes : 170 ms,
    parcours complet de la table) et sur les statistiques colis (30 s).
- **Non ajouté** : Redis. Les mesures montrent que PostgreSQL n'est pas le goulot une fois
  les requêtes corrigées : le CPU du processus Node est à 100 %. Limite restante : le cache
  est local au processus, et une invalidation (paramètres) n'atteint pas les autres workers
  avant le TTL.

## 10. Node.js

- **Event loop** : aucune API synchrone (`*Sync`, crypto synchrone) dans `src/`. bcrypt
  (coût 12, conservé) est asynchrone. Export CSV de 10 000 lignes : délai maximal de la
  boucle 33 ms.
- **CPU** : sous charge, le processus est à ~100 % d'un cœur dans presque tous les scénarios.
  Le coût dominant est la sérialisation JSON de lignes `colis` larges (~3 Ko par élément
  de liste). Pour monter en charge : plusieurs processus (PM2 cluster ou plusieurs
  conteneurs, désormais sûrs grâce aux corrections de concurrence et de tâches).
- **Mémoire** :
  - Avant : jusqu'à 2,4 Go de RSS sous charge sur le détail colis (produit cartésien).
  - Après : ≤ 305 Mo sur tous les scénarios.
  - Tas V8 borné (`--max-old-space-size=384`) dans le conteneur limité à 512 Mo.
- **Fuites** : cache sans purge corrigé ; minuteurs du cache en `unref`.
- **Arrêt** :
  - Avant : `npm start` en PID 1, SIGTERM perdu, sortie en code 1 sans fermeture propre.
  - Après : `exec node`, arrêt propre en 90 ms, code 0 (mesuré sur l'image Docker).

## 11. API

- **Endpoints lourds** : détail et recherche de colis (§3), dashboard (§3), listes admin (§4).
- **Payloads** : non réduits. Les listes renvoient toujours toutes les colonnes du colis,
  pour préserver le contrat des applications mobile et web. Une réduction (DTO de liste)
  diminuerait fortement le CPU, mais elle doit être validée avec les équipes clientes.
- **Requêtes supprimées** : voir §3 (dashboard 19 → 6, annonce 22 224 → 26, suivi client).
- **Journalisation** :
  - les erreurs 4xx (jeton expiré, validation…) sont journalisées en `warn`, sans pile ni
    corps de requête ;
  - `/health` et `/ready` ne sont plus journalisés ;
  - nouvel endpoint `/ready` qui vérifie PostgreSQL.
- **HTTP** : `keepAliveTimeout` 65 s (supérieur à Nginx, évite des 502 intermittents),
  `requestTimeout` 120 s, `urlencoded` limité à 1 Mo.

## 12. Tests

| Tests | Résultat |
|---|---|
| `npm run lint`, `npm run format:check` | OK |
| Tests unitaires (tarification) | 12/12 |
| Tests de bout en bout sur PostgreSQL réel (`tests/e2e`) | 10/10, dont **4 nouveaux tests de concurrence** qui échouent sur l'ancien code (vérifié) |
| Migrations : base neuve, base existante, retour complet, rejeu | OK, 0 index en double |
| Réponses identiques avant/après (script de comparaison sur la base de 200 000 colis) | Dashboard stats, par pays, KPIs, clients actifs, statistiques colis, listes admin/client/reçus, détails, suivi, export CSV : identiques (hors ordre des sous-listes, désormais déterministe) |
| Image Docker : démarrage, migrations, `/health`, `/ready`, arrêt SIGTERM | OK (dépendances installées hors Docker : le réseau du bac à sable n'atteint pas le registre npm depuis un conteneur) |
| CI | Nouveau job : PostgreSQL 16, migrations aller/retour, tests unitaires et e2e ; déploiement seulement si la CI réussit |

## 13. Performance AVANT / APRÈS

Test de charge `scripts/perf/charge.js` (autocannon) : 10 s par essai, serveur neuf à chaque
scénario, même base. Ancien code : commit `ce71138` avec son schéma. autocannon fournit les
percentiles p50, p97,5 et p99 : **p95 non mesuré**.

### À 50 connexions simultanées

| Endpoint | Req/s avant | Req/s après | p50 avant → après (ms) | p97,5 avant → après (ms) | p99 avant → après (ms) |
|---|---:|---:|---:|---:|---:|
| `GET /admin/colis/:id` (colis lourd) | 0 (aucune réponse en 10 s) | 86 | 6 142 → 571 | 10 065 → 727 | 10 065 → 1 086 |
| `GET /client/colis/:id` | 21 | 135 | 1 419 → 362 | 8 684 → 444 | 9 435 → 744 |
| `GET /client/colis/recus` | 23 | 197 | 2 150 → 247 | 2 614 → 316 | 2 654 → 419 |
| `GET /admin/colis?reference=` | 27 | 112 | 1 764 → 436 | 3 370 → 546 | 3 908 → 808 |
| `GET /admin/colis` (liste admin) | 41 | 70 | 1 207 → 684 | 1 845 → 1 082 | 2 142 → 1 237 |
| `GET /admin/dashboard/stats` (en cache) | 819 | 810 | 57 → 57 | 109 → 109 | 123 → 116 |
| `GET /client/colis` (liste client) | 193 | 189 | 253 → 259 | 323 → 337 | 592 → 555 |
| `POST /admin/colis/:id/evenements` (même colis) | 165 | 136 | 300 → 364 | 369 → 456 | 452 → 488 |
| `GET /health` | 3 045 | 3 597 | 13 → 11 | 66 → 61 | 74 → 69 |

### À 10 et 100 connexions (requêtes/s)

| Endpoint | 10 conn. avant → après | 100 conn. avant → après |
|---|---:|---:|
| `GET /admin/colis/:id` | 0 → 82 (p50 3 818 → 119 ms) | 0 → 81 |
| `GET /client/colis/:id` | 21 → 127 | 17 → 133 |
| `GET /client/colis/recus` | 22 → 172 | 18 → 190 |
| `GET /admin/colis?reference=` | 28 → 103 | 23 → 113 |
| `GET /admin/colis` | 40 → 71 | 37 → 70 |
| `GET /client/colis` | 183 → 169 | 202 → 191 |
| `POST …/evenements` (même colis) | 141 → 122 | 166 → 127 |
| `POST /auth/login` (bcrypt 12) | 15 → 15, **139 erreurs → 0** | — |

### Mémoire et connexions (maximum pendant l'essai)

| | Avant | Après |
|---|---:|---:|
| RSS maximale, `GET /admin/colis/:id` à 100 conn. | 879 Mo (2,4 Go lors d'une campagne sans redémarrage) | 302 Mo |
| RSS maximale, tous scénarios | 879 Mo | 305 Mo |
| Connexions PostgreSQL maximales | 17 (sync au démarrage + requêtes) | 14 |
| Erreurs `SequelizeConnectionAcquireTimeoutError` (pool saturé) pendant la campagne | 74 | 0 |
| Index en base après la campagne (10 redémarrages) | 418 | 171 |

### Mesures unitaires complémentaires

| Mesure | Avant | Après |
|---|---:|---:|
| Scan de colis avec SMTP lent (2 emails) | 8 154 ms | 39 ms (emails envoyés 4 s plus tard en arrière-plan) |
| Annonce de tournée, 11 110 clients | 17,2 s / 22 224 requêtes | 0,98 s / 26 requêtes |
| Export CSV, 10 000 lignes | 3,0-3,8 s | 1,3-1,4 s |
| Statistiques colis (à froid, sans cache) | 98 ms, 4 connexions, ~360 ms SQL cumulés | 155 ms, 1 connexion, ~155 ms SQL (+ cache 30 s) |
| Arrêt sous charge : requêtes interrompues | 48 | 0 |

**Régressions assumées, et pourquoi :**

- Liste client : −2 à −8 % de débit. C'est une requête de plus par page pour des clients qui
  ont peu de colis. En échange : ordre stable entre pages, et gain important pour les
  comptes à gros volume (page profonde 375 → 142 ms).
- Écritures concurrentes sur un même colis : −18 à −23 %, à cause du verrou (§7).
- Statistiques à froid : 98 → 155 ms de latence unitaire, mais une seule connexion au lieu
  de quatre et 57 % de temps SQL en moins.

## 14. Risques restants

- **CPU Node** : un processus sature un cœur, avec les réponses larges (colis complets) comme
  coût dominant. Pour la production : plusieurs processus ou conteneurs, et à terme des DTO
  de liste (à valider avec les applications).
- **File d'envois non durable** : un email ou un push en attente est perdu si le processus
  s'arrête brutalement (comme avant, quand l'envoi se faisait dans la requête). Si ces
  messages deviennent contractuels : file persistante (Redis/BullMQ ou table de jobs).
- **Rate limiting en mémoire** : par processus, donc non partagé entre workers ou conteneurs
  (la limite effective est multipliée). Avec plusieurs instances : store Redis. Le plafond
  global de 1 000 requêtes / 15 min par IP peut aussi bloquer des utilisateurs derrière le
  même NAT opérateur ; à ajuster selon le trafic réel.
- **Cache et invalidation** : locaux au processus (TTL de 30 s à 5 min).
- **Conteneur de plusieurs milliers de colis** : environ 8 ms par colis mesurés (2,4 s pour
  300). Au-delà de quelques milliers, le passer en tâche de fond.
- **PgBouncer** : utile seulement si le nombre total de connexions (workers × pool)
  approche `max_connections`.
- **Tuning serveur PostgreSQL** (`shared_buffers`, `work_mem`, autovacuum sur `suivi_colis`
  et `activity_logs`) : non audité, pas d'accès au serveur de production.
  `pg_stat_statements` est à activer pour mesurer en réel.
- **Croissance sans purge** : `activity_logs` et `notifications`. Prévoir une rétention
  (purge ou archivage).
- **Uploads** : `multer.memoryStorage` peut garder jusqu'à 11 fichiers de 10 Mo en mémoire
  par requête. Nginx limite le corps à 10 Mo, mais pas un hébergement sans Nginx (Render).
- **`npm audit`** : 2 vulnérabilités modérées (`uuid` < 11.1.1 via Sequelize, fonctions
  v3/v5/v6 avec tampon, non utilisées par le projet). Le correctif proposé rétrograde
  Sequelize en v3 : non appliqué.
- **Deux instances qui migrent en même temps** : `sequelize-cli` n'a pas de verrou.
  Exécuter les migrations depuis une seule instance, ce qui est le cas du compose actuel.
- **Monitoring** : aucun (APM, métriques). À ajouter avant une montée en charge.

## 15. Recommandations production

1. Déployer avec la nouvelle CI : le déploiement n'a lieu que si lint, migrations et tests
   passent, et il vérifie `/ready`.
2. Régler ensemble `PM2_INSTANCES` (ou le nombre de conteneurs) et `DB_POOL_MAX`, de sorte
   que `instances × DB_POOL_MAX` reste sous `max_connections`, marge d'administration
   comprise.
3. Garder les migrations comme seule source du schéma. Ne jamais réintroduire
   `sequelize.sync()` au démarrage.
4. Activer `pg_stat_statements` et relancer `scripts/perf/requetes-par-endpoint.js` sur une
   copie de la production pour valider les index sur la distribution réelle des données.
5. Passer le rate limiting sur Redis dès qu'il y a plus d'une instance.
6. Définir une rétention pour `activity_logs` et `notifications`.

---

### Outils ajoutés

- `scripts/perf/seed.sql` : jeu de données volumineux (base dédiée uniquement).
- `scripts/perf/requetes-par-endpoint.js` : nombre de requêtes SQL, durée et taille par
  endpoint.
- `scripts/perf/charge.js` : test de charge (débit, percentiles, CPU, mémoire, connexions
  PostgreSQL).
