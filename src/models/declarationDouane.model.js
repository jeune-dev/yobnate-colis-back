const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { DEVISES } = require('../constants/facturation');
const { INCOTERMS, TYPES_CONTENU } = require('../constants/colis');

/**
 * Déclaration douanière rattachée à une expédition internationale.
 *
 * Le corridor France - Sénégal franchit la frontière de l'Union européenne : toute
 * marchandise doit être décrite ligne à ligne (cf. ArticleDouane) et accompagnée
 * d'une facture commerciale. Les documents seuls en sont dispensés.
 */
class DeclarationDouane extends Model {
  get estBloquee() {
    return this.statut === 'bloquee';
  }
}

DeclarationDouane.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    colisId: { type: DataTypes.UUID, allowNull: false, unique: true },
    /** Motif de l'exportation, déterminant pour le régime douanier applicable. */
    motifExport: {
      type: DataTypes.ENUM(...TYPES_CONTENU),
      allowNull: false,
      defaultValue: 'marchandise',
    },
    incoterm: { type: DataTypes.ENUM(...INCOTERMS), allowNull: false, defaultValue: 'DAP' },
    paysExport: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    paysImport: { type: DataTypes.ENUM(...CODES_PAYS), allowNull: false },
    /** Valeur totale des marchandises, servant d'assiette aux droits et taxes. */
    valeurTotale: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    devise: { type: DataTypes.ENUM(...DEVISES), allowNull: false, defaultValue: 'EUR' },
    fraisTransport: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    fraisAssurance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    poidsBrutKg: { type: DataTypes.DECIMAL(8, 3), allowNull: true },
    poidsNetKg: { type: DataTypes.DECIMAL(8, 3), allowNull: true },
    /** Identifiants fiscaux de l'expéditeur professionnel. */
    numeroEori: { type: DataTypes.STRING(20), allowNull: true },
    numeroNinea: { type: DataTypes.STRING(20), allowNull: true },
    numeroTvaIntracom: { type: DataTypes.STRING(20), allowNull: true },
    /** Numéro attribué par l'administration des douanes. */
    numeroDeclaration: { type: DataTypes.STRING(50), allowNull: true },
    factureCommercialeNumero: { type: DataTypes.STRING(40), allowNull: true },
    droitsEstimes: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxesEstimees: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    droitsReels: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    taxesReelles: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    statut: {
      type: DataTypes.ENUM('brouillon', 'soumise', 'en_cours', 'bloquee', 'dedouanee', 'refusee'),
      allowNull: false,
      defaultValue: 'brouillon',
    },
    motifBlocage: { type: DataTypes.STRING(500), allowNull: true },
    dateSoumission: { type: DataTypes.DATE, allowNull: true },
    dateDedouanement: { type: DataTypes.DATE, allowNull: true },
    /** Justificatifs téléversés : facture, certificat d'origine, licence. */
    documents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    commentaire: { type: DataTypes.STRING(1000), allowNull: true },
  },
  {
    sequelize,
    modelName: 'DeclarationDouane',
    tableName: 'declarations_douane',
    indexes: [
      { unique: true, fields: ['colisId'] },
      { fields: ['statut'] },
      { fields: ['numeroDeclaration'] },
    ],
  }
);

module.exports = DeclarationDouane;
