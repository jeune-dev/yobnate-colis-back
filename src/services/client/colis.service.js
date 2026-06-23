// services/client/colis.service.js

// TODO: getMesColis(userId, filters, pagination)
//   - Colis de l'utilisateur connecté
//   - Filtres : statut, entrepotId, dateDebut, dateFin
//   - Retourner { rows, count, totalPages }

// TODO: getColisById(userId, colisId)
//   - Vérifier appartenance au userId
//   - Include SuiviColis, DeclarationDouane

// TODO: declarerColis(userId, data)
//   - Client déclare un colis qu'il va envoyer vers l'entrepôt
//   - data : nom, description, categorie, valeurDeclaree, typeColis, entrepotId
//   - Créer le colis en statut 'en_attente' (pas encore reçu)
//   - Retourner le colis avec adresse entrepôt pour expédition

// TODO: getSuiviColis(userId, colisId)
//   - Historique complet des événements du colis
//   - Vérifier appartenance au userId

// TODO: getAdresseEntrepot(userId)
//   - Retourner l'adresse virtuelle du client dans l'entrepôt

// TODO: soumettreDocumentsDouane(userId, colisId, files)
//   - Uploader des documents douaniers pour une déclaration en révision
//   - Mettre à jour DeclarationDouane.documentsUrls
