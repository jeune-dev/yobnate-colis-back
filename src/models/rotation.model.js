const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { STATUTS_ROTATION, MODES_TRANSPORT } = require('../constants/reseau');

/**
 * Rotation — départ groupé reliant les deux pays.
 *
 * Les colis prêts sont affectés à une rotation (vol aérien ou conteneur maritime).
 * La rotation porte le manifeste, les capacités et les jalons de l'acheminement ;
 * son changement de statut se propage à tous les colis embarqués.
 */
class Rotation extends Model {
  get tauxRemplissagePoids() {
    if (!this.capacitePoidsKg) return null;
    return Number(((Number(this.poidsCharge) / Number(this.capacitePoidsKg)) * 100).toFixed(1));
  }

  get estOuverteAuChargement() {
    return ['planifiee', 'ouverte'].includes(this.statut);
  }
}

Rotation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reference: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    modeTransport: {
      type: DataTypes.ENUM(...MODES_TRANSPORT),
      allowNull: false,
      defaultValue: 'aerien',
    },
    paysDepart: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    paysArrivee: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    hubDepartId: { type: DataTypes.UUID, allowNull: true },
    hubArriveeId: { type: DataTypes.UUID, allowNull: true },
    transporteur: { type: DataTypes.STRING(100), allowNull: true },
    numeroVol: { type: DataTypes.STRING(30), allowNull: true },
    numeroConteneur: { type: DataTypes.STRING(30), allowNull: true },
    /** Date et heure limites de remise des colis pour embarquer sur cette rotation. */
    dateCloture: { type: DataTypes.DATE, allowNull: true },
    dateDepartPrevue: { type: DataTypes.DATE, allowNull: false },
    dateDepartEffective: { type: DataTypes.DATE, allowNull: true },
    dateArriveePrevue: { type: DataTypes.DATE, allowNull: false },
    dateArriveeEffective: { type: DataTypes.DATE, allowNull: true },
    capacitePoidsKg: { type: DataTypes.DECIMAL(10, 2), allowNull: true, validate: { min: 1 } },
    capaciteColis: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
    /** Compteurs maintenus à chaque affectation ou retrait de colis. */
    poidsCharge: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    nbColisCharges: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    statut: {
      type: DataTypes.ENUM(...STATUTS_ROTATION),
      allowNull: false,
      defaultValue: 'planifiee',
    },
    numeroManifeste: { type: DataTypes.STRING(40), allowNull: true },
    /** Numéro de déclaration douanière groupée du lot. */
    numeroDeclarationGroupee: { type: DataTypes.STRING(50), allowNull: true },
    commentaire: { type: DataTypes.STRING(500), allowNull: true },
    creePar: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Rotation',
    tableName: 'rotations',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['statut'] },
      { fields: ['paysDepart', 'paysArrivee'] },
      { fields: ['dateDepartPrevue'] },
    ],
    validate: {
      datesCoherentes() {
        if (
          this.dateArriveePrevue &&
          this.dateDepartPrevue &&
          new Date(this.dateArriveePrevue) < new Date(this.dateDepartPrevue)
        ) {
          throw new Error("La date d'arrivée prévue doit être postérieure à la date de départ");
        }
      },
    },
  }
);

module.exports = Rotation;
