const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const {
  TYPES_SURCHARGE,
  MODES_SURCHARGE,
  ASSIETTES_SURCHARGE,
  DEVISES,
} = require('../constants/facturation');

/**
 * Frais annexes appliqués au-dessus du fret : surcharge carburant, zone éloignée,
 * prime d'assurance, manutention hors gabarit…
 *
 * Une surcharge automatique est déclenchée par le moteur de tarification selon ses
 * conditions ; une surcharge manuelle est ajoutée par un agent lors du traitement.
 */
class Surcharge extends Model {
  /** Montant dû pour une assiette et un poids donnés, borné par le plancher et le plafond. */
  calculer({ assiette = 0, poidsKg = 0 } = {}) {
    let montant;
    if (this.mode === 'pourcentage') montant = (Number(assiette) * Number(this.valeur)) / 100;
    else if (this.mode === 'par_kg') montant = Number(poidsKg) * Number(this.valeur);
    else montant = Number(this.valeur);

    if (this.montantMinimum !== null && this.montantMinimum !== undefined) {
      montant = Math.max(montant, Number(this.montantMinimum));
    }
    if (this.montantMaximum !== null && this.montantMaximum !== undefined) {
      montant = Math.min(montant, Number(this.montantMaximum));
    }
    return Number(montant.toFixed(2));
  }
}

Surcharge.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
      validate: { notEmpty: true },
    },
    libelle: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: { notEmpty: true },
    },
    type: {
      type: DataTypes.ENUM(...TYPES_SURCHARGE),
      allowNull: false,
    },
    mode: {
      type: DataTypes.ENUM(...MODES_SURCHARGE),
      allowNull: false,
      defaultValue: 'pourcentage',
    },
    valeur: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    /** Base de calcul lorsque le mode est un pourcentage. */
    assiette: {
      type: DataTypes.ENUM(...ASSIETTES_SURCHARGE),
      allowNull: false,
      defaultValue: 'fret',
    },
    devise: {
      type: DataTypes.ENUM(...DEVISES),
      allowNull: false,
      defaultValue: 'XOF',
    },
    montantMinimum: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 0 },
    },
    montantMaximum: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      validate: { min: 0 },
    },
    /** Restriction facultative : null = applicable à tous les services. */
    serviceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Restriction facultative : null = applicable aux deux pays. */
    paysApplication: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: true,
    },
    automatique: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    /** Ne s'applique qu'aux corridors internationaux (FR vers SN et inversement). */
    internationalUniquement: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    soumiseTva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ordreApplication: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Surcharge',
    tableName: 'surcharges',
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['type'] },
      { fields: ['isActive', 'automatique'] },
      { fields: ['serviceId'] },
    ],
    validate: {
      bornesCoherentes() {
        const min = this.montantMinimum;
        const max = this.montantMaximum;
        if (
          min !== null &&
          min !== undefined &&
          max !== null &&
          max !== undefined &&
          Number(max) < Number(min)
        ) {
          throw new Error('Le montant maximum doit être supérieur au montant minimum');
        }
      },
    },
  }
);

module.exports = Surcharge;
