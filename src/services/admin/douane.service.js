// services/admin/douane.service.js

// TODO: getDeclarationsEnAttente(pagination)
//   - Déclarations douanières statut='en_attente'
//   - Include Colis(User)

// TODO: getAllDeclarations(filters, pagination)
//   - Filtres : statut, colisId, dateDebut, dateFin

// TODO: getDeclarationById(id)
//   - Détail complet avec colis et user

// TODO: approuverDeclaration(id, noteDouane)
//   - Passer à 'approuvee'
//   - Mettre à jour le statut du colis

// TODO: rejeterDeclaration(id, noteDouane)
//   - Passer à 'rejetee', notifier le client avec la raison

// TODO: mettreEnRevision(id, noteDouane)
//   - Demander des documents supplémentaires au client

// TODO: calculerTaxes(valeurDeclaree, pays, categorie)
//   - Calculer les taxes selon les règles douanières
