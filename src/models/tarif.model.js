// models/tarif.model.js
// Grille tarifaire par zone, type de colis et tranche de poids
// Colonnes : id, zoneId (FK), typeColis (enum: standard|express|fragile|volumineux),
//            poidsMin (kg), poidsMax (kg), prixParKg, prixFixe,
//            delaiEstime (jours), isActive, createdAt, updatedAt
