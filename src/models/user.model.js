const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../config/pays');
const { ROLES } = require('../config/roles');

/**
 * Compte utilisateur : client particulier ou professionnel, personnel opérationnel
 * (coursier, agent de point) et administrateurs.
 *
 * Un client professionnel peut disposer d'une remise contractuelle et d'un paiement
 * à terme ; un agent est rattaché à un point de collecte, un coursier à un pays.
 */
class User extends Model {
  toSafeJSON() {
    const { password: _password, tokenVersion: _tokenVersion, ...safe } = this.toJSON();
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
    /** Code postal de domiciliation : cible les annonces de tournées de collecte. */
    codePostal: { type: DataTypes.STRING(10), allowNull: true },
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
    /**
     * Justificatif professionnel (NINEA ou Kbis) contrôlé par l'administrateur :
     * ouvre droit au tarif préférentiel.
     */
    justificatifProUrl: { type: DataTypes.STRING(255), allowNull: true },
    justificatifProPublicId: { type: DataTypes.STRING(150), allowNull: true },
    justificatifProValide: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
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

    // ── Parrainage ─────────────────────────────────────────────────────────
    /** Code personnel à partager ; le filleul le saisit à l'inscription. */
    codeParrainage: { type: DataTypes.STRING(12), allowNull: true, unique: true },
    parrainId: { type: DataTypes.UUID, allowNull: true },
    /** Crédit acquis par le parrainage, imputé sur les prochaines expéditions (EUR). */
    creditParrainage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    /** Le bonus de bienvenue du filleul et la récompense du parrain ont été attribués. */
    parrainageRecompense: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // ── Préférences ────────────────────────────────────────────────────────
    langue: { type: DataTypes.ENUM('fr'), allowNull: false, defaultValue: 'fr' },
    notificationsEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notificationsSms: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    notificationsWhatsapp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notificationsPush: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // ── Compte ─────────────────────────────────────────────────────────────
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    emailVerifie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    avatarUrl: { type: DataTypes.STRING(255), allowNull: true },
    avatarPublicId: { type: DataTypes.STRING(150), allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    /**
     * Version des jetons d'accès, portée par le claim `tv` : incrémentée à chaque
     * changement ou réinitialisation de mot de passe, elle périme immédiatement
     * les jetons émis auparavant.
     */
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    /** Numéro de téléphone prouvé par un code : condition d'accès aux colis reçus. */
    telephoneVerifie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /**
     * Date de suppression du compte à la demande de son titulaire : les données
     * personnelles sont alors pseudonymisées, les expéditions et factures conservées
     * (obligations comptables).
     */
    supprimeLe: { type: DataTypes.DATE, allowNull: true },

    // ── Notifications push (mobile) ────────────────────────────────────────
    /** Dernier token FCM connu de l'appareil du client, pour l'envoi de push. */
    deviceToken: { type: DataTypes.STRING(255), allowNull: true },
    devicePlatform: { type: DataTypes.ENUM('ios', 'android'), allowNull: true },
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
      { fields: ['parrainId'] },
      { fields: ['codePostal'] },
      // Connexion, inscription, codes : recherche de l'email sans tenir compte de la casse
      { name: 'users_lower_email', fields: [sequelize.fn('lower', sequelize.col('email'))] },
    ],
  }
);

module.exports = User;
