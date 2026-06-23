// services/client/expedition.service.js

// TODO: demanderExpedition(userId, data)
//   - data : colisIds[], adresseId, typeExpedition, note
//   - Vérifier que les colis sont en statut 'en_stock' et appartiennent au client
//   - Calculer le tarif estimé
//   - Créer une demande d'expédition (statut='en_attente')
//   - Notifier l'admin

// TODO: getMesExpeditions(userId, filters, pagination)
//   - Expéditions du client connecté
//   - Filtres : statut, typeExpedition, dateDebut, dateFin
//   - Retourner { rows, count, totalPages }

// TODO: getExpeditionById(userId, expeditionId)
//   - Vérifier appartenance
//   - Include ColisExpedition(Colis), SuiviExpedition, Facture(Paiement), Adresse

// TODO: getSuiviExpedition(userId, expeditionId)
//   - Historique des événements de l'expédition
//   - Vérifier appartenance

// TODO: annulerExpedition(userId, expeditionId)
//   - Possible uniquement si statut='en_attente'
//   - Remettre colis en 'en_stock'

// TODO: getDevisExpedition(userId, colisIds, typeExpedition)
//   - Simuler le coût sans créer l'expédition
//   - Retourner { poids, montantFret, delaiEstime }
