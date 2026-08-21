const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { ROLES } = require('../constants/roles');

/**
 * Compte utilisateur : client particulier ou professionnel, personnel opérationnel
 * (coursier, agent de point) et administrateurs.
 *
 * Un client professionnel peut disposer d'une remise contractuelle et d'un paiement
 * à terme ; un agent est rattaché à un point de collecte, un coursier à un pays.
 */
class User extends Model {
  toSafeJSON() {
    const { password: _password, ...safe } = this.toJSON();
    return safe;
  }

  get nomComplet() {
    return `${this.prenom} ${this.nom}`.trim();
  }
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nom: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true, len: [2, 50] },
    },
    prenom: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true, len: [2, 50] },
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: { type: DataTypes.STRING(100), allowNull: false },
    telephone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    telephoneSecondaire: { type: DataTypes.STRING(20), allowNull: true },
    role: { type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: 'client' },

    // ── Rattachement géographique et opérationnel ──────────────────────────
    /** Pays de résidence : détermine la devise de facturation par défaut. */
    pays: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false, defaultValue: 'SN' },
    villeId: { type: DataTypes.UUID, allowNull: true },
    adresse: { type: DataTypes.STRING(255), allowNull: true },
    /** Point de collecte d'affectation d'un agent. */
    pointCollecteId: { type: DataTypes.UUID, allowNull: true },

    // ── Compte professionnel ───────────────────────────────────────────────
    typeCompte: {
      type: DataTypes.ENUM('particulier', 'entreprise'),
      allowNull: false,
      defaultValue: 'particulier',
    },
    raisonSociale: { type: DataTypes.STRING(150), allowNull: true },
    /** NINEA au Sénégal, SIRET en France. */
    numeroIdentificationFiscale: { type: DataTypes.STRING(30), allowNull: true },
    numeroTvaIntracom: { type: DataTypes.STRING(20), allowNull: true },
    /** Remise contractuelle appliquée au fret, en pourcentage. */
    remiseContractuelle: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    /** Autorise l'expédition sans paiement préalable, réglée sur facture. */
    paiementDiffereAutorise: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    plafondEncours: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },

    // ── Préférences ────────────────────────────────────────────────────────
    langue: { type: DataTypes.ENUM('fr'), allowNull: false, defaultValue: 'fr' },
    notificationsEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notificationsSms: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // ── Compte ─────────────────────────────────────────────────────────────
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    emailVerifie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    avatarUrl: { type: DataTypes.STRING(255), allowNull: true },
    avatarPublicId: { type: DataTypes.STRING(150), allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    indexes: [
      { fields: ['role'] },
      { fields: ['isActive'] },
      { fields: ['pays'] },
      { fields: ['pointCollecteId'] },
      { fields: ['typeCompte'] },
    ],
  }
);

module.exports = User;
