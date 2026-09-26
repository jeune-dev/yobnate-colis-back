const { DataTypes, Model, Op } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Avis client sur le service (cahier des charges : « Avis clients » du site
 * vitrine, « Nombre et qualité des évaluations » du tableau de bord).
 *
 * Un avis n'est publié qu'après modération par un administrateur. Il peut porter
 * sur une expédition précise (livrée ou retirée) : un seul avis par expédition.
 */
class Avis extends Model {}

Avis.STATUTS = ['en_attente', 'publie', 'rejete'];

Avis.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    /** Expédition évaluée, facultative (avis général sur le service sinon). */
    colisId: { type: DataTypes.UUID, allowNull: true },
    note: { type: DataTypes.SMALLINT, allowNull: false, validate: { min: 1, max: 5 } },
    titre: { type: DataTypes.STRING(120), allowNull: true },
    commentaire: { type: DataTypes.STRING(1000), allowNull: true },
    statut: {
      type: DataTypes.ENUM(...Avis.STATUTS),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    motifRejet: { type: DataTypes.STRING(255), allowNull: true },
    /** Réponse publique de l'entreprise, affichée sous l'avis. */
    reponse: { type: DataTypes.STRING(1000), allowNull: true },
    moderePar: { type: DataTypes.UUID, allowNull: true },
    modereLe: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Avis',
    tableName: 'avis',
    indexes: [
      // Affichage public : avis publiés, du plus récent au plus ancien
      { name: 'avis_statut_created_at', fields: ['statut', { name: 'createdAt', order: 'DESC' }] },
      { name: 'avis_user_id', fields: ['userId'] },
      // Un seul avis par expédition
      {
        name: 'avis_colis_id_unique',
        unique: true,
        fields: ['colisId'],
        where: { colisId: { [Op.ne]: null } },
      },
    ],
  }
);

module.exports = Avis;
