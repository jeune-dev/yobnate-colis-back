// services/admin/user.service.js

// TODO: getAllUsers(filters, pagination)
//   - Filtres : nom, email, isActive, isVerified, paysOrigine
//   - Include AdresseEntrepot
//   - Retourner { rows, count, totalPages }

// TODO: getUserById(id)
//   - Include AdresseEntrepot, Colis (count), Expedition (count)
//   - Retourner user sans password

// TODO: getUserColis(userId, pagination)
//   - Tous les colis d'un client avec pagination

// TODO: getUserExpeditions(userId, pagination)
//   - Toutes les expéditions d'un client avec pagination

// TODO: bloquerUser(id, raison)
//   - isActive=false + email notification

// TODO: activerUser(id)
//   - isActive=true

// TODO: deleteUser(id)
//   - Suppression soft / anonymisation

// TODO: exportUsers(format)
//   - Export CSV/Excel liste clients
