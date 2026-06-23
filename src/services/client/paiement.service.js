// services/client/paiement.service.js

// TODO: getMesFactures(userId, pagination)
//   - Factures du client avec Expedition et Paiement
//   - Retourner { rows, count, totalPages }

// TODO: getFactureById(userId, factureId)
//   - Vérifier appartenance au userId
//   - Include Expedition(ColisExpedition), Paiement

// TODO: payerFacture(userId, factureId, data)
//   - data : methode, details de paiement
//   - Vérifier que la facture est en statut 'en_attente'
//   - Initier le paiement selon la methode (Wave, Orange Money, carte)
//   - Créer le Paiement en statut 'en_attente'
//   - Retourner URL de redirection ou instructions

// TODO: confirmerPaiementWebhook(data)
//   - Callback de l'opérateur de paiement
//   - Vérifier la signature du webhook
//   - Passer le paiement à 'succes' et la facture à 'payee'
//   - Déclencher la suite du processus

// TODO: telechargerFacturePDF(userId, factureId)
//   - Vérifier appartenance
//   - Générer et retourner le PDF
