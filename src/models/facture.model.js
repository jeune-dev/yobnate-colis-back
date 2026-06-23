// models/facture.model.js
// Facture générée pour une expédition
// Colonnes : id (UUID), reference (ex: YBC-FAC-2026-00001), userId (FK),
//            expeditionId (FK UNIQUE), montantFret, fraisDouane,
//            fraisLivraison, remise, montantTotal, statut (enum: en_attente|payee|annulee),
//            dateEmission, dateLimitePaiement, createdAt, updatedAt
