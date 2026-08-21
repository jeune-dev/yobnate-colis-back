const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const {
  TYPES_POINT,
  SERVICES_POINT,
  JOURS_SEMAINE,
  HORAIRES_PAR_DEFAUT,
} = require('../constants/reseau');

/**
 * Point de collecte du réseau — pièce maîtresse du dispositif Yobnate Express.
 *
 * L'administrateur déclare, pour chacun des deux pays desservis, les lieux
 * physiques où un client dépose son colis et où un destinataire vient le retirer.
 * Un point peut aussi être un hub de tri (nœud interne, non exposé au public).
 */
class PointCollecte extends Model {
  /** Vrai si le point est ouvert au public à l'instant donné (fuseau du pays). */
  estOuvertLe(date = new Date()) {
    if (!this.isActive || this.enMaintenance) return false;
    const jour = JOURS_SEMAINE[(date.getDay() + 6) % 7];
    const creneaux = this.horaires?.[jour] || [];
    const minutes = date.getHours() * 60 + date.getMinutes();
    const enMinutes = (hhmm) => {
      const [h, m] = String(hhmm).split(':').map(Number);
      return h * 60 + m;
    };
    return creneaux.some((c) => minutes >= enMinutes(c.debut) && minutes < enMinutes(c.fin));
  }

  /** Vrai si le point rend la prestation demandée (dépôt, retrait, paiement…). */
  offreService(service) {
    return Array.isArray(this.services) && this.services.includes(service);
  }

  /** Vrai si le point a atteint sa capacité de stockage déclarée. */
  estSature() {
    if (!this.capaciteMaxColis) return false;
    return this.colisEnStock >= this.capaciteMaxColis;
  }
}

PointCollecte.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    /** Code court affiché sur les étiquettes et les bordereaux (ex. « SN-DKR-01 »). */
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
    },
    nom: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { notEmpty: true, len: [2, 120] },
    },
    type: {
      type: DataTypes.ENUM(...TYPES_POINT),
      allowNull: false,
      defaultValue: 'agence',
    },
    pays: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    villeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adresse: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { notEmpty: true },
    },
    complementAdresse: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    quartier: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    codePostal: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      validate: { min: -90, max: 90 },
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      validate: { min: -180, max: 180 },
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },
    /** Grille hebdomadaire : { lundi: [{ debut: '09:00', fin: '18:00' }], … }. */
    horaires: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: HORAIRES_PAR_DEFAUT,
    },
    /** Prestations activées sur ce point (cf. SERVICES_POINT). */
    services: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['depot', 'retrait'],
    },
    /** Nombre maximal de colis stockables simultanément (null = illimité). */
    capaciteMaxColis: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1 },
    },
    /** Poids unitaire maximal accepté au dépôt, en kilogrammes. */
    poidsMaxColisKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: true,
      validate: { min: 0.1 },
    },
    /** Compteur de colis physiquement présents, maintenu par les mouvements de suivi. */
    colisEnStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    /** Délai de garde avant retour à l'expéditeur ou frais de stockage. */
    delaiGardeJours: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 15,
      validate: { min: 1, max: 90 },
    },
    /** Agent responsable du point (utilisateur de rôle `agent_point`). */
    responsableId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Hub auquel le point est rattaché pour le ramassage et l'éclatement. */
    hubRattachementId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Instructions d'accès affichées au client (étage, parking, repère…). */
    instructionsAcces: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    photoPublicId: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    /** Un point non public reste invisible du client (hub, entrepôt interne). */
    visiblePublic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    /** Fermeture temporaire sans désactivation définitive. */
    enMaintenance: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    motifMaintenance: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'PointCollecte',
    tableName: 'points_collecte',
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['pays'] },
      { fields: ['villeId'] },
      { fields: ['type'] },
      { fields: ['pays', 'isActive', 'visiblePublic'] },
      { fields: ['latitude', 'longitude'] },
      { fields: ['responsableId'] },
    ],
  }
);

PointCollecte.SERVICES = SERVICES_POINT;

module.exports = PointCollecte;
