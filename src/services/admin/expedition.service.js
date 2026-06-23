// services/admin/expedition.service.js

// TODO: createExpedition(data)
//   - data : userId, colisIds[], adresseId, typeExpedition
//   - Vérifier que tous les colis appartiennent au client et sont en statut 'en_stock'
//   - Calculer le poids total et le montantTotal via les tarifs
//   - Générer référence unique (YBC-EXP-ANNEE-XXXXX)
//   - Créer l'expédition + les ColisExpedition
//   - Passer les colis en statut 'en_expedition'
//   - Générer la Facture correspondante
//   - Notifier le client

// TODO: getAllExpeditions(filters, pagination)
//   - Filtres : userId, statut, typeExpedition, dateDebut, dateFin, reference
//   - Include User, Adresse, ColisExpedition(Colis)
//   - Retourner { rows, count, totalPages }

// TODO: getExpeditionById(id)
//   - Include User, Adresse, ColisExpedition(Colis), SuiviExpedition, Facture(Paiement)

// TODO: updateStatutExpedition(id, statut, localisation, description, transporteurInfo)
//   - Mettre à jour statut + transporteur si fourni
//   - Créer événement SuiviExpedition
//   - Notifier le client par email + notification in-app

// TODO: confirmerExpedition(id)
//   - Passer à statut 'confirmee'

// TODO: marquerEnTransit(id, transporteur, numeroSuivi)
//   - Passer à 'en_transit', enregistrer infos transporteur

// TODO: marquerEnDouane(id, noteDouane)
//   - Passer à 'en_douane', créer alerte client pour documents

// TODO: marquerLivraisonLocale(id)
//   - Passer à 'livraison_locale'

// TODO: marquerLivree(id, dateLivraison)
//   - Passer à 'livree', mettre colis en statut 'livre'

// TODO: annulerExpedition(id, raison)
//   - Remettre les colis en statut 'en_stock'
//   - Annuler la facture si non payée

// TODO: calculerTarif(colisIds, zoneId, typeExpedition)
//   - Calculer le coût total selon la grille tarifaire
