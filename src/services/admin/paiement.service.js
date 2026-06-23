// services/admin/paiement.service.js

// TODO: getAllPaiements(filters, pagination)
//   - Filtres : userId, statut, methode, dateDebut, dateFin
//   - Include User, Facture

// TODO: getPaiementById(id)
//   - Détail avec Facture et User

// TODO: confirmerPaiement(id, transactionId)
//   - Valider un paiement manuel (virement, cash)
//   - Passer statut à 'succes', mettre la facture à 'payee'
//   - Déclencher la préparation de l'expédition

// TODO: rembourserPaiement(id, raison)
//   - Appeler l'API opérateur pour remboursement
//   - Passer à 'rembourse'

// TODO: getRevenusTotal(periode)
//   - SUM des paiements 'succes' sur la période
