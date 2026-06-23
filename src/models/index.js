// models/index.js — Associations Sequelize
// TODO: importer tous les modèles
// Associations :
//   User.hasOne(AdresseEntrepot)         AdresseEntrepot.belongsTo(User)
//   User.hasMany(Colis)                   Colis.belongsTo(User)
//   User.hasMany(Expedition)              Expedition.belongsTo(User)
//   User.hasMany(Facture)                 Facture.belongsTo(User)
//   User.hasMany(Paiement)                Paiement.belongsTo(User)
//   User.hasMany(Adresse)                 Adresse.belongsTo(User)
//   User.hasMany(RefreshToken)            RefreshToken.belongsTo(User)
//   User.hasMany(UserOtp)                 UserOtp.belongsTo(User)
//   Pays.hasMany(Zone)                    Zone.belongsTo(Pays)
//   Zone.hasMany(Tarif)                   Tarif.belongsTo(Zone)
//   Entrepot.hasMany(Colis)               Colis.belongsTo(Entrepot)
//   Colis.hasMany(SuiviColis)             SuiviColis.belongsTo(Colis)
//   Colis.hasOne(DeclarationDouane)       DeclarationDouane.belongsTo(Colis)
//   Expedition.hasMany(ColisExpedition)   ColisExpedition.belongsTo(Expedition)
//   Colis.hasMany(ColisExpedition)        ColisExpedition.belongsTo(Colis)
//   Expedition.hasMany(SuiviExpedition)   SuiviExpedition.belongsTo(Expedition)
//   Expedition.hasOne(Facture)            Facture.belongsTo(Expedition)
//   Facture.hasOne(Paiement)              Paiement.belongsTo(Facture)
//   Expedition.belongsTo(Adresse)
// TODO: exporter toutes les entités
