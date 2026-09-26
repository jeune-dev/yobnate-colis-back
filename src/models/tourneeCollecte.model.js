const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../config/pays');
const { STATUTS_TOURNEE } = require('../config/reseau');

/**
 * Tournée de collecte à domicile.
 *
 * L'administrateur ouvre un créneau de collecte pour une date donnée et une
 * liste de villes et de codes postaux. La tournée ouverte est annoncée en
 * bannière à l'ouverture de l'application, et les clients déjà domiciliés dans
 * la zone sont prévenus par notification. Les demandes de collecte des
 * catégories 2 et 3 s'y rattachent.
 */
class TourneeCollecte extends Model {
  /** Un code postal ou une ville relève-t-il de la zone de la tournée ? */
  couvre({ codePostal = null, villeId = null } = {}) {
    const codes = this.codesPostaux || [];
    const villes = this.villeIds || [];
    if (!codes.length && !villes.length) return true;
    const cp = String(codePostal || '').trim();
    const parCodePostal =
      cp && codes.some((c) => cp === String(c) || (String(c).length === 2 && cp.startsWith(c)));
    return Boolean(parCodePostal || (villeId && villes.includes(villeId)));
  }

  get estComplete() {
    return this.capaciteMax !== null && Number(this.nbInscrits) >= Number(this.capaciteMax);
  }

  get accepteInscriptions() {
    if (this.statut !== 'ouverte') return false;
    if (this.estComplete) return false;
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const limite = this.dateLimiteInscription || this.dateCollecte;
    return String(limite) >= aujourdHui;
  }
}

TourneeCollecte.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    titre: { type: DataTypes.STRING(150), allowNull: false },
    pays: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false, defaultValue: 'FR' },
    /** Date de la prochaine collecte, renseignée avant chaque tournée. */
    dateCollecte: { type: DataTypes.DATEONLY, allowNull: false },
    heureDebut: { type: DataTypes.STRING(5), allowNull: true },
    heureFin: { type: DataTypes.STRING(5), allowNull: true },
    /** Clôture des inscriptions ; par défaut la date de collecte elle-même. */
    dateLimiteInscription: { type: DataTypes.DATEONLY, allowNull: true },
    /** Villes desservies par la tournée (identifiants). */
    villeIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    /** Codes postaux desservis ; un préfixe de deux chiffres couvre un département. */
    codesPostaux: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    capaciteMax: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
    nbInscrits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    statut: {
      type: DataTypes.ENUM(...STATUTS_TOURNEE),
      allowNull: false,
      defaultValue: 'brouillon',
    },
    /** Texte de la bannière affichée à l'ouverture de l'application. */
    messageBanniere: { type: DataTypes.STRING(500), allowNull: true },
    afficherBanniere: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    coursierId: { type: DataTypes.UUID, allowNull: true },
    /** Point où les colis collectés sont déposés en fin de tournée. */
    pointDepotId: { type: DataTypes.UUID, allowNull: true },
    notificationEnvoyeeAt: { type: DataTypes.DATE, allowNull: true },
    commentaire: { type: DataTypes.STRING(500), allowNull: true },
    creePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'TourneeCollecte',
    tableName: 'tournees_collecte',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['statut', 'dateCollecte'] },
      { fields: ['pays'] },
    ],
  }
);

module.exports = TourneeCollecte;
