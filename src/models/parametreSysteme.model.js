const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Paramètres de réglage du moteur métier, modifiables par le super administrateur
 * sans redéploiement (taux de change, coefficient volumétrique, taux de TVA…).
 */
class ParametreSysteme extends Model {
  /** Convertit la valeur stockée (texte) vers son type déclaré. */
  get valeurTypee() {
    const brut = this.valeur;
    if (brut === null || brut === undefined) return null;
    if (this.type === 'nombre') return Number(brut);
    if (this.type === 'booleen') return brut === 'true' || brut === '1';
    if (this.type === 'json') {
      try {
        return JSON.parse(brut);
      } catch {
        return null;
      }
    }
    return brut;
  }
}

ParametreSysteme.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    cle: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
    },
    valeur: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('texte', 'nombre', 'booleen', 'json'),
      allowNull: false,
      defaultValue: 'texte',
    },
    categorie: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'general',
    },
    libelle: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    modifiable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'ParametreSysteme',
    tableName: 'parametres_systeme',
    indexes: [{ unique: true, fields: ['cle'] }, { fields: ['categorie'] }],
  }
);

module.exports = ParametreSysteme;
