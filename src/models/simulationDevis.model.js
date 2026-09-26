const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../config/pays');

/**
 * Simulation de devis (avec ou sans compte), conservée pour mesurer le taux de
 * conversion demandé au tableau de bord : combien de simulations aboutissent à
 * une expédition déclarée (`colisId` renseigné à la commande).
 *
 * Aucune donnée personnelle : l'identifiant de visiteur est un UUID aléatoire
 * généré par le site ou l'application, sans lien avec l'adresse IP.
 */
class SimulationDevis extends Model {}

SimulationDevis.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    visiteurId: { type: DataTypes.UUID, allowNull: true },
    categorie: { type: DataTypes.STRING(20), allowNull: true },
    paysDepart: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: true },
    paysArrivee: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: true },
    /** Meilleure offre proposée (montant TTC) et sa devise. */
    montantEstime: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    devise: { type: DataTypes.STRING(3), allowNull: true },
    nbOffres: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    /** Expédition déclarée à la suite de cette simulation. */
    colisId: { type: DataTypes.UUID, allowNull: true },
    convertiLe: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'SimulationDevis',
    tableName: 'simulations_devis',
    updatedAt: false,
    indexes: [
      { name: 'simulations_devis_created_at', fields: ['createdAt'] },
      // Rattachement à la commande : dernière simulation non convertie du compte ou du visiteur
      { name: 'simulations_devis_user_id', fields: ['userId', 'createdAt'] },
      { name: 'simulations_devis_visiteur_id', fields: ['visiteurId', 'createdAt'] },
    ],
  }
);

module.exports = SimulationDevis;
