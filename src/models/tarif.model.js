const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { DEVISES } = require('../constants/facturation');

/**
 * Ligne de grille tarifaire.
 *
 * Un tarif s'applique à un service, un corridor (pays et zones de départ/arrivée)
 * et une tranche de poids. Le prix se compose d'un forfait de tranche plus, le cas
 * échéant, un prix au kilogramme au-delà du seuil inclus dans le forfait.
 */
class Tarif extends Model {
  /** Prix du fret pour un poids facturé donné, hors surcharges et taxes. */
  calculerFret(poidsFactureKg) {
    const poids = Number(poidsFactureKg);
    const inclus = Number(this.poidsInclusKg ?? this.poidsMinKg);
    const supplement = Math.max(0, poids - inclus);
    return Number(this.prixBase) + supplement * Number(this.prixParKgSupplementaire);
  }

  /** La tranche couvre-t-elle ce poids ? Borne haute incluse, sauf tranche ouverte. */
  couvrePoids(poidsKg) {
    const poids = Number(poidsKg);
    if (poids < Number(this.poidsMinKg)) return false;
    if (this.poidsMaxKg === null) return true;
    return poids <= Number(this.poidsMaxKg);
  }
}

Tarif.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    serviceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    paysDepart: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    paysArrivee: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    /** Zones facultatives : null = tarif applicable à tout le pays. */
    zoneDepartId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    zoneArriveeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    poidsMinKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    /** Borne haute de la tranche ; null pour une tranche ouverte (au-delà de…). */
    poidsMaxKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: true,
      validate: { min: 0.01 },
    },
    /** Forfait de la tranche. */
    prixBase: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    /** Poids couvert par le forfait ; au-delà, le prix au kilo s'applique. */
    poidsInclusKg: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: true,
      validate: { min: 0 },
    },
    prixParKgSupplementaire: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    devise: {
      type: DataTypes.ENUM(...DEVISES),
      allowNull: false,
      defaultValue: 'XOF',
    },
    /** Facturation minimale, quel que soit le poids. */
    montantMinimum: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    /** Période de validité : permet de préparer une hausse de tarif à l'avance. */
    dateDebutValidite: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    dateFinValidite: {
      type: DataTypes.DATEONLY,
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
    modelName: 'Tarif',
    tableName: 'tarifs',
    indexes: [
      { fields: ['serviceId'] },
      { fields: ['paysDepart', 'paysArrivee', 'isActive'] },
      { fields: ['zoneDepartId'] },
      { fields: ['zoneArriveeId'] },
      { fields: ['poidsMinKg', 'poidsMaxKg'] },
    ],
    validate: {
      tranchePoidsCoherente() {
        if (this.poidsMaxKg !== null && Number(this.poidsMaxKg) <= Number(this.poidsMinKg)) {
          throw new Error('Le poids maximum de la tranche doit être supérieur au poids minimum');
        }
      },
      validiteCoherente() {
        if (
          this.dateDebutValidite &&
          this.dateFinValidite &&
          this.dateFinValidite < this.dateDebutValidite
        ) {
          throw new Error('La date de fin de validité doit être postérieure à la date de début');
        }
      },
    },
  }
);

module.exports = Tarif;
