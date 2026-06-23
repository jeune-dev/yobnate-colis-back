// models/colis.model.js
// Colis reçu à l'entrepôt ou déclaré par le client
// Colonnes : id (UUID), reference (ex: YBC-COL-2026-00001), userId (FK),
//            entrepotId (FK), nom, description, categorie,
//            poids (kg), longueur, largeur, hauteur (cm),
//            valeurDeclaree (FCFA), devise (défaut: FCFA),
//            typeColis (enum: standard|express|fragile|volumineux),
//            statut (enum: en_attente|recu|en_stock|en_expedition|livre|retourne|perdu),
//            images (JSON array URLs), noteClient, noteAdmin,
//            dateReception, createdAt, updatedAt
