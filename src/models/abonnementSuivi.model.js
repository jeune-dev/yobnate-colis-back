const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Abonnement aux notifications de suivi d'une expédition.
 *
 * Le destinataire n'a pas nécessairement de compte : il reçoit les alertes par
 * email ou SMS grâce à un abonnement, révocable par un jeton de désinscription.
 */
class AbonnementSuivi extends Model {}

AbonnementSuivi.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    colisId: { type: DataTypes.UUID, allowNull: false },
    canal: { type: DataTypes.ENUM('email', 'sms'), allowNull: false, defaultValue: 'email' },
    destination: { type: DataTypes.STRING(150), allowNull: false, validate: { notEmpty: true } },
    /** Rôle de l'abonné, pour adapter le contenu du message. */
    profil: {
      type: DataTypes.ENUM('expediteur', 'destinataire', 'tiers'),
      allowNull: false,
      defaultValue: 'destinataire',
    },
    /** Codes d'événements déclenchant une notification ; vide = tous. */
    evenements: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    /** Jeton opaque permettant la désinscription sans authentification. */
    jetonDesinscription: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    dernierEnvoiAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AbonnementSuivi',
    tableName: 'abonnements_suivi',
    indexes: [
      { fields: ['colisId'] },
      { unique: true, fields: ['jetonDesinscription'] },
      { unique: true, fields: ['colisId', 'canal', 'destination'] },
    ],
  }
);

module.exports = AbonnementSuivi;
