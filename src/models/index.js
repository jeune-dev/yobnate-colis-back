const sequelize = require('../config/db');

const User = require('./user.model');
const RefreshToken = require('./refreshToken.model');
const UserOtp = require('./userOtp.model');
const Ville = require('./ville.model');
const Colis = require('./colis.model');
const SuiviColis = require('./suiviColis.model');
const Tarif = require('./tarif.model');
const Facture = require('./facture.model');
const Paiement = require('./paiement.model');
const Notification = require('./notification.model');
const ActivityLog = require('./activityLog.model');

// User <-> RefreshToken / UserOtp
User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UserOtp, { foreignKey: 'userId', onDelete: 'CASCADE' });
UserOtp.belongsTo(User, { foreignKey: 'userId' });

// User <-> Colis (client propriétaire)
User.hasMany(Colis, { foreignKey: 'userId', onDelete: 'CASCADE' });
Colis.belongsTo(User, { foreignKey: 'userId', as: 'client' });

// Ville <-> Colis (départ / arrivée)
Ville.hasMany(Colis, { foreignKey: 'villeDepartId', as: 'colisDepart' });
Colis.belongsTo(Ville, { foreignKey: 'villeDepartId', as: 'villeDepart' });

Ville.hasMany(Colis, { foreignKey: 'villeArriveeId', as: 'colisArrivee' });
Colis.belongsTo(Ville, { foreignKey: 'villeArriveeId', as: 'villeArrivee' });

// Colis <-> SuiviColis (historique de statut)
Colis.hasMany(SuiviColis, { foreignKey: 'colisId', as: 'historique', onDelete: 'CASCADE' });
SuiviColis.belongsTo(Colis, { foreignKey: 'colisId' });
SuiviColis.belongsTo(User, { foreignKey: 'createdBy', as: 'auteur' });

// Ville <-> Tarif (grille tarifaire par trajet)
Ville.hasMany(Tarif, { foreignKey: 'villeDepartId', as: 'tarifsDepart' });
Ville.hasMany(Tarif, { foreignKey: 'villeArriveeId', as: 'tarifsArrivee' });
Tarif.belongsTo(Ville, { foreignKey: 'villeDepartId', as: 'villeDepart' });
Tarif.belongsTo(Ville, { foreignKey: 'villeArriveeId', as: 'villeArrivee' });

// Colis <-> Facture <-> Paiement
Colis.hasOne(Facture, { foreignKey: 'colisId', onDelete: 'CASCADE' });
Facture.belongsTo(Colis, { foreignKey: 'colisId' });
User.hasMany(Facture, { foreignKey: 'userId' });
Facture.belongsTo(User, { foreignKey: 'userId' });

Facture.hasOne(Paiement, { foreignKey: 'factureId', onDelete: 'CASCADE' });
Paiement.belongsTo(Facture, { foreignKey: 'factureId' });
User.hasMany(Paiement, { foreignKey: 'userId' });
Paiement.belongsTo(User, { foreignKey: 'userId' });
Paiement.belongsTo(User, { foreignKey: 'recordedBy', as: 'enregistrePar' });

// User <-> Notification
User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

// User <-> ActivityLog
User.hasMany(ActivityLog, { foreignKey: 'userId', onDelete: 'SET NULL' });
ActivityLog.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  User,
  RefreshToken,
  UserOtp,
  Ville,
  Colis,
  SuiviColis,
  Tarif,
  Facture,
  Paiement,
  Notification,
  ActivityLog
};
