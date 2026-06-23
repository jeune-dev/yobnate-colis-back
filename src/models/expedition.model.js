// models/expedition.model.js
// Expédition groupant un ou plusieurs colis vers le client
// Colonnes : id (UUID), reference (ex: YBC-EXP-2026-00001), userId (FK),
//            adresseId (FK), entrepotId (FK),
//            typeExpedition (enum: standard|express),
//            statut (enum: en_attente|confirmee|en_transit|en_douane|livraison_locale|livree|annulee),
//            poidsTotal, montantTotal, fraisDouane, fraisLivraison,
//            transporteur, numeroSuiviTransporteur,
//            dateEstimeeLivraison, dateLivraison,
//            noteClient, noteAdmin, createdAt, updatedAt
