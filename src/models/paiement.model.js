// models/paiement.model.js
// Transaction de paiement liée à une facture
// Colonnes : id (UUID), factureId (FK UNIQUE), userId (FK), montant,
//            methode (enum: wave|orange_money|carte|virement|cash),
//            statut (enum: en_attente|succes|echoue|rembourse),
//            transactionId, payeAt, createdAt, updatedAt
