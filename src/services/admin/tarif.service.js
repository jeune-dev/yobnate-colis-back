// services/admin/tarif.service.js

// TODO: createTarif(data)
//   - data : zoneId, typeColis, poidsMin, poidsMax, prixParKg, prixFixe, delaiEstime
//   - Vérifier qu'il n'y a pas de chevauchement de tranches de poids pour la même zone/type

// TODO: updateTarif(id, data)
//   - Mettre à jour les champs du tarif

// TODO: deleteTarif(id)
//   - Supprimer ou désactiver un tarif

// TODO: getAllTarifs(filters)
//   - Filtres : zoneId, typeColis, isActive
//   - Include Zone(Pays)
//   - Retourner la liste

// TODO: getTarifById(id)
//   - Détail d'un tarif

// TODO: calculerPrixExpedition(poids, zoneId, typeColis)
//   - Trouver le tarif applicable selon poids et type
//   - Retourner { tarifApplique, montantTotal, delaiEstime }
