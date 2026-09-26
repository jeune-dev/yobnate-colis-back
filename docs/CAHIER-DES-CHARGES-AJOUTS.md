# Ajouts du cahier des charges — intégration front

Points du cahier des charges ajoutés au back-end : avis clients, FAQ, taux de conversion,
marge moyenne, niveau de stock et indicateurs marketing. Le schéma complet des requêtes
et réponses est dans `docs/openapi.json`.

## Avis clients

| Qui | Route | Rôle |
|---|---|---|
| Client | `POST /client/avis` | `{ note: 1-5, titre?, commentaire?, colisId? }`, publié après modération |
| Client | `GET /client/avis`, `DELETE /client/avis/:id` | Ses avis |
| Admin | `GET /admin/avis?statut=en_attente` | File de modération |
| Admin | `PATCH /admin/avis/:id/moderation` | `{ statut: 'publie' \| 'rejete', motifRejet?, reponse? }` |
| Public | `GET /public/avis?page=&limit=&note=` | Avis publiés, synthèse (moyenne, répartition), nom abrégé « Prénom N. » |

Règles :
- Une expédition ne peut être évaluée qu'une fois, et seulement si elle est livrée ou retirée.
- Un client ne peut avoir qu'un seul avis général à la fois.
- Un motif est obligatoire pour rejeter un avis ; le client est notifié de la décision.

## FAQ

- `GET /public/faq` : questions actives, regroupées par rubrique (`general`, `expedition`,
  `tarifs`, `paiement`, `suivi`, `douane`, `compte`) dans l'ordre choisi par l'admin.
- `GET|POST /admin/faq`, `PUT|DELETE /admin/faq/:id` : rédaction de la FAQ.

## Mesure d'audience (site vitrine et application)

Le client génère deux UUID aléatoires :
- `visiteurId` : à conserver durablement (`localStorage` ou stockage de l'application) ;
- `sessionId` : à renouveler après 30 minutes d'inactivité, ou quand l'API répond
  `sessionExpiree: true`.

```http
POST /public/visites
Authorization: Bearer …        (facultatif : rattache la visite au compte, « visiteur connu »)
{ "sessionId": "…", "visiteurId": "…", "plateforme": "web|android|ios",
  "evenement": "page", "page": "/tarifs",
  "referent": "<document.referrer>", "utmSource": "…", "utmMedium": "…", "utmCampagne": "…" }
```

Quand l'envoyer :
- `evenement: "page"` à chaque page ou écran affiché ;
- `evenement: "ping"` toutes les 30 à 60 s tant que la page est visible (mesure du temps passé) ;
- débit limité à 60 requêtes par minute et par adresse.

Données conservées :
- aucune adresse IP ni agent utilisateur n'est enregistré, et les sessions sont purgées
  après 13 mois ;
- la source de trafic (recherche, réseau social, campagne, email, site référent, direct)
  est déduite du référent et des paramètres UTM.

Le recueil du consentement (bandeau cookies) reste à la charge du site vitrine.

## Taux de conversion

- Le site et l'application envoient l'en-tête **`X-Visiteur-Id: <visiteurId>`** sur
  `POST /public/devis`, `POST /client/colis/devis` et `POST /client/colis`.
- La réponse du devis contient `devis.simulationId`. Le renvoyer dans le formulaire de
  déclaration (`simulationId`) rattache la commande à la simulation. Sans lui, le
  rattachement se fait automatiquement sur la dernière simulation du compte ou du
  visiteur (30 jours).

## Marge moyenne

- `PATCH /admin/colis/:id/cout-revient` `{ coutRevient }` : coût réel d'une expédition,
  dans sa devise.
- `POST /admin/rotations/:id/cout` `{ coutTotal, devise }` : coût d'un conteneur ou d'un vol,
  réparti sur les colis au prorata du poids facturé et converti dans la devise de chaque colis.
- La marge est calculée hors TVA et hors droits de douane, sur les seules expéditions dont
  le coût est connu. `couverture` indique la part des expéditions concernées.

## Tableau de bord (admin)

Toutes ces routes acceptent `?dateDebut=&dateFin=` (par défaut : 30 derniers jours).

| Route | Contenu |
|---|---|
| `GET /admin/dashboard/kpis` | Existant, avec en plus `marge` (par devise), `tauxConversion` et `tauxConversionVisiteurs` |
| `GET /admin/dashboard/conversion` | Simulations, converties, taux par catégorie, part des commandes issues d'une simulation |
| `GET /admin/dashboard/marketing` | Trafic (visites, visiteurs uniques, pages, rebond, par jour), % de visiteurs connus, temps moyen, sources, référents, campagnes |
| `GET /admin/dashboard/evaluations` | Nombre, note moyenne, répartition, taux de satisfaction (4-5 étoiles), avis en attente |
| `GET /admin/dashboard/stock` | Emballages (rupture / sous le seuil / disponibles), occupation des points de collecte |

Le seuil d'alerte de stock est le paramètre `seuil_alerte_stock_emballages` (5 par défaut).
