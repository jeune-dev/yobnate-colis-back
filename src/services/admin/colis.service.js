// services/admin/colis.service.js

// TODO: createColis(data, files)
//   - data : userId, entrepotId, nom, description, categorie, poids, dimensions,
//             valeurDeclaree, typeColis
//   - Générer une référence unique (YBC-COL-ANNEE-XXXXX)
//   - Uploader les photos du colis sur Cloudinary
//   - Créer le colis avec statut 'recu'
//   - Créer un événement SuiviColis initial
//   - Notifier le client (email + notification in-app)

// TODO: getAllColis(filters, pagination)
//   - Filtres : userId, entrepotId, statut, typeColis, dateDebut, dateFin, reference
//   - Include User, Entrepot
//   - Retourner { rows, count, totalPages }

// TODO: getColisById(id)
//   - Include User, Entrepot, SuiviColis, DeclarationDouane, ColisExpedition(Expedition)

// TODO: updateColis(id, data)
//   - Mettre à jour les champs (poids, dimensions, description, noteAdmin)
//   - Créer un événement SuiviColis si le statut change

// TODO: updateStatutColis(id, statut, localisation, description)
//   - Mettre à jour le statut
//   - Créer un événement SuiviColis
//   - Notifier le client

// TODO: ajouterPhotos(id, files)
//   - Uploader de nouvelles photos et les ajouter au tableau images

// TODO: supprimerColis(id)
//   - Vérifier que le colis n'est pas dans une expédition active
//   - Suppression ou marquage 'perdu'/'retourne'

// TODO: exportColis(filters, format)
//   - Export CSV/Excel
