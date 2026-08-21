const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');
const { CODES_PAYS } = require('../constants/pays');
const { DEVISES } = require('../constants/facturation');
const {
  STATUTS_COLIS,
  TYPES_CONTENU,
  MODES_DEPOT,
  MODES_LIVRAISON,
  INCOTERMS,
  PAYEURS,
  STATUTS_TERMINAUX,
  TRANSITIONS_AUTORISEES,
} = require('../constants/colis');

/**
 * Expédition — la lettre de transport (LTA) du réseau Yobnate Express.
 *
 * Une expédition regroupe une à plusieurs pièces physiques (cf. ColisPiece), suit
 * un corridor France ⇄ Sénégal, entre dans le réseau par un dépôt en point de
 * collecte ou un enlèvement à domicile, et en sort par un retrait en point ou une
 * livraison à domicile. Elle porte le détail tarifaire figé au moment de la
 * commande, afin qu'une évolution ultérieure de la grille ne réécrive pas l'histoire.
 */
class Colis extends Model {
  /** Expédition internationale : soumise aux formalités douanières. */
  get estInternational() {
    return this.paysDepart !== this.paysArrivee;
  }

  /** Plus aucune transition de statut n'est possible. */
  get estTermine() {
    return STATUTS_TERMINAUX.includes(this.statut);
  }

  /** Statuts atteignables depuis l'état courant. */
  get transitionsPossibles() {
    return TRANSITIONS_AUTORISEES[this.statut] || [];
  }

  /** Livraison en retard au regard de la date estimée. */
  get estEnRetard() {
    if (this.estTermine || !this.dateLivraisonEstimee) return false;
    return new Date(this.dateLivraisonEstimee) < new Date();
  }
}

Colis.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    /** Numéro de suivi communiqué au client, unique et non réattribuable. */
    reference: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    /** Référence libre du client (bon de commande, numéro interne). */
    referenceClient: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    serviceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // ── Contenu ────────────────────────────────────────────────────────────
    typeContenu: {
      type: DataTypes.ENUM(...TYPES_CONTENU),
      allowNull: false,
      defaultValue: 'marchandise',
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    fragile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    marchandiseDangereuse: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // ── Expéditeur ─────────────────────────────────────────────────────────
    expediteurNom: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    expediteurEntreprise: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    expediteurTelephone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    expediteurEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },
    paysDepart: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    villeDepartId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adresseDepart: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    codePostalDepart: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    // ── Destinataire ───────────────────────────────────────────────────────
    destinataireNom: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    destinataireEntreprise: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    destinataireTelephone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    destinataireEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },
    paysArrivee: {
      type: DataTypes.ENUM(...CODES_PAYS),
      allowNull: false,
    },
    villeArriveeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adresseLivraison: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    codePostalArrivee: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    instructionsLivraison: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    // ── Entrée et sortie du réseau ─────────────────────────────────────────
    modeDepot: {
      type: DataTypes.ENUM(...MODES_DEPOT),
      allowNull: false,
      defaultValue: 'point_collecte',
    },
    pointCollecteDepartId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    modeLivraison: {
      type: DataTypes.ENUM(...MODES_LIVRAISON),
      allowNull: false,
      defaultValue: 'point_retrait',
    },
    pointRetraitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    /** Point où le colis se trouve physiquement à l'instant T. */
    pointActuelId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // ── Poids et gabarit ───────────────────────────────────────────────────
    nbPieces: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1, max: 100 },
    },
    poidsReelKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      validate: { min: 0.001 },
    },
    /** (L × l × h) / coefficient du service, cumulé sur toutes les pièces. */
    poidsVolumetriqueKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      defaultValue: 0,
    },
    /** Maximum du poids réel et du poids volumétrique — assiette de facturation. */
    poidsFactureKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: false,
      validate: { min: 0.001 },
    },
    /** Poids constaté à la pesée en agence, s'il diffère du poids déclaré. */
    poidsVerifieKg: {
      type: DataTypes.DECIMAL(8, 3),
      allowNull: true,
    },

    // ── Valeur et assurance ────────────────────────────────────────────────
    valeurDeclaree: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    deviseValeur: {
      type: DataTypes.ENUM(...DEVISES),
      allowNull: false,
      defaultValue: 'XOF',
    },
    assuranceSouscrite: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // ── Conditions commerciales ────────────────────────────────────────────
    incoterm: {
      type: DataTypes.ENUM(...INCOTERMS),
      allowNull: false,
      defaultValue: 'DAP',
    },
    payeur: {
      type: DataTypes.ENUM(...PAYEURS),
      allowNull: false,
      defaultValue: 'expediteur',
    },

    // ── Tarification figée à la commande ───────────────────────────────────
    devise: {
      type: DataTypes.ENUM(...DEVISES),
      allowNull: false,
      defaultValue: 'XOF',
    },
    montantFret: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    montantSurcharges: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    montantAssurance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    montantTva: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    /** Droits et taxes à l'import, estimés (DAP) ou avancés par nos soins (DDP). */
    montantDroitsDouane: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    montantTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    /** Journal détaillé du calcul : tarif retenu, surcharges ligne à ligne, taux. */
    detailTarification: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },

    // ── Acheminement ───────────────────────────────────────────────────────
    statut: {
      type: DataTypes.ENUM(...STATUTS_COLIS),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    rotationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    coursierEnlevementId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    coursierLivraisonId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    nbTentativesLivraison: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },

    // ── Jalons temporels ───────────────────────────────────────────────────
    datePriseEnCharge: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dateLivraisonEstimee: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    dateLivraisonEffective: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    /** Fin du délai de garde au point de retrait ; au-delà, retour expéditeur. */
    dateLimiteRetrait: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // ── Sécurité du retrait ────────────────────────────────────────────────
    /** Code exigé du destinataire au retrait ou à la livraison. */
    codeRetrait: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    // ── Pièces jointes et annotations ──────────────────────────────────────
    photos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    notesInternes: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    annuleMotif: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    motifIncident: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    /** Origine de la saisie : espace client, back-office ou point de collecte. */
    sourceCreation: {
      type: DataTypes.ENUM('client', 'admin', 'agent_point'),
      allowNull: false,
      defaultValue: 'client',
    },
    creePar: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Colis',
    tableName: 'colis',
    indexes: [
      { unique: true, fields: ['reference'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['serviceId'] },
      { fields: ['villeDepartId'] },
      { fields: ['villeArriveeId'] },
      { fields: ['pointCollecteDepartId'] },
      { fields: ['pointRetraitId'] },
      { fields: ['pointActuelId'] },
      { fields: ['rotationId'] },
      { fields: ['coursierLivraisonId'] },
      { fields: ['userId', 'createdAt'] },
      { fields: ['statut', 'dateLivraisonEstimee'] },
      { fields: ['createdAt'] },
    ],
  }
);

Colis.STATUTS = STATUTS_COLIS;

module.exports = Colis;
