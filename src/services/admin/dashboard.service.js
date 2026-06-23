// services/admin/dashboard.service.js

// TODO: getStatsGlobales()
//   - Total clients actifs, total colis (par statut), total expéditions
//   - Revenus du mois en cours, revenus totaux
//   - Colis en attente de traitement, expéditions en transit
//   - Retourner objet stats complet

// TODO: getColisParStatut()
//   - COUNT(*) GROUP BY statut sur table Colis
//   - Retourner [ { statut, count } ]

// TODO: getExpeditionsParStatut()
//   - COUNT(*) GROUP BY statut sur table Expedition
//   - Retourner [ { statut, count } ]

// TODO: getRevenusParMois(annee)
//   - SUM(montantTotal) des factures payées GROUP BY mois
//   - Retourner tableau 12 entrées { mois, revenus }

// TODO: getColisEnAttente()
//   - Colis statut='en_attente' ou 'recu' non encore affectés à une expédition
//   - Retourner la liste avec infos client

// TODO: getExpeditionsEnTransit()
//   - Expéditions statut='en_transit' ou 'en_douane'
//   - Retourner la liste

// TODO: getClientsActifs(limit=10)
//   - Clients avec le plus d'expéditions ou de colis
//   - Retourner [ { user, nbColis, nbExpeditions } ]

// TODO: getRevenusParPays()
//   - Revenus groupés par pays d'origine des colis
//   - Retourner [ { pays, revenus } ]
