// models/declarationDouane.model.js
// Déclaration douanière attachée à un colis
// Colonnes : id, colisId (FK UNIQUE), natureContenu, valeurDeclaree,
//            devise, paysOrigine, paysDestination,
//            statut (enum: en_attente|approuvee|rejetee|en_revision),
//            taxesMontant, noteDouane, documentsUrls (JSON),
//            dateDeclaration, createdAt, updatedAt
