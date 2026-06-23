// services/client/profil.service.js

// TODO: getProfil(userId)
//   - Include AdresseEntrepot
//   - Retourner sans password

// TODO: updateProfil(userId, data)
//   - data : nom, prenom, telephone, paysOrigine

// TODO: updateAvatar(userId, file)
//   - Upload Cloudinary, supprimer l'ancienne image
//   - Mettre à jour avatar URL

// TODO: getAdresses(userId)
//   - Liste des adresses de livraison du client

// TODO: ajouterAdresse(userId, data)
//   - Vérifier max 5 adresses
//   - Si isDefault=true : désactiver l'ancienne

// TODO: updateAdresse(userId, adresseId, data)
//   - Vérifier appartenance

// TODO: supprimerAdresse(userId, adresseId)
//   - Vérifier appartenance, pas d'expédition liée active

// TODO: setAdresseDefault(userId, adresseId)
//   - Désactiver toutes, activer celle-ci
