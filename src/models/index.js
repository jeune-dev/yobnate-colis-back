const sequelize = require('../config/db');

// ── Comptes et sécurité ──────────────────────────────────────────────────────
const User = require('./user.model');
const RefreshToken = require('./refreshToken.model');
const UserOtp = require('./userOtp.model');
const TokenBlacklist = require('./tokenBlacklist.model');
const Adresse = require('./adresse.model');

// ── Référentiels ─────────────────────────────────────────────────────────────
const ParametreSysteme = require('./parametreSysteme.model');
const Zone = require('./zone.model');
const Ville = require('./ville.model');
const PointCollecte = require('./pointCollecte.model');
const JourFerie = require('./jourFerie.model');

// ── Offre et tarification ────────────────────────────────────────────────────
const ServiceExpedition = require('./serviceExpedition.model');
const Tarif = require('./tarif.model');
const Surcharge = require('./surcharge.model');

// ── Expédition ───────────────────────────────────────────────────────────────
const Colis = require('./colis.model');
const ColisPiece = require('./colisPiece.model');
const SuiviColis = require('./suiviColis.model');
const Rotation = require('./rotation.model');
const DemandeEnlevement = require('./demandeEnlevement.model');
const PreuveLivraison = require('./preuveLivraison.model');
const AbonnementSuivi = require('./abonnementSuivi.model');

// ── Douane ───────────────────────────────────────────────────────────────────
const DeclarationDouane = require('./declarationDouane.model');
const ArticleDouane = require('./articleDouane.model');

// ── Facturation ──────────────────────────────────────────────────────────────
const Facture = require('./facture.model');
const Paiement = require('./paiement.model');

// ── Relation client ──────────────────────────────────────────────────────────
const Reclamation = require('./reclamation.model');
const MessageReclamation = require('./messageReclamation.model');
const Notification = require('./notification.model');
const ActivityLog = require('./activityLog.model');

/* ────────────────────────────────────────────────────────────────────────────
 * Comptes
 * ────────────────────────────────────────────────────────────────────────── */

User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(UserOtp, { foreignKey: 'userId', onDelete: 'CASCADE' });
UserOtp.belongsTo(User, { foreignKey: 'userId' });

User.belongsTo(Ville, { foreignKey: 'villeId', as: 'ville' });
// Point d'affectation d'un agent de point de collecte
User.belongsTo(PointCollecte, { foreignKey: 'pointCollecteId', as: 'pointAffectation' });

User.hasMany(Adresse, { foreignKey: 'userId', as: 'carnetAdresses', onDelete: 'CASCADE' });
Adresse.belongsTo(User, { foreignKey: 'userId' });
Adresse.belongsTo(Ville, { foreignKey: 'villeId', as: 'ville' });
Adresse.belongsTo(PointCollecte, {
  foreignKey: 'pointRetraitPrefereId',
  as: 'pointRetraitPrefere',
});

/* ────────────────────────────────────────────────────────────────────────────
 * Réseau : zones, villes, points de collecte
 * ────────────────────────────────────────────────────────────────────────── */

Zone.hasMany(Ville, { foreignKey: 'zoneId', as: 'villes' });
Ville.belongsTo(Zone, { foreignKey: 'zoneId', as: 'zone' });

Ville.hasMany(PointCollecte, { foreignKey: 'villeId', as: 'pointsCollecte' });
PointCollecte.belongsTo(Ville, { foreignKey: 'villeId', as: 'ville' });

// Un agent responsable pilote son point ; un point est rattaché à un hub
PointCollecte.belongsTo(User, { foreignKey: 'responsableId', as: 'responsable' });
PointCollecte.belongsTo(PointCollecte, { foreignKey: 'hubRattachementId', as: 'hubRattachement' });
PointCollecte.hasMany(PointCollecte, { foreignKey: 'hubRattachementId', as: 'pointsRattaches' });

/* ────────────────────────────────────────────────────────────────────────────
 * Offre et tarification
 * ────────────────────────────────────────────────────────────────────────── */

ServiceExpedition.hasMany(Tarif, { foreignKey: 'serviceId', as: 'tarifs', onDelete: 'CASCADE' });
Tarif.belongsTo(ServiceExpedition, { foreignKey: 'serviceId', as: 'service' });

Zone.hasMany(Tarif, { foreignKey: 'zoneDepartId', as: 'tarifsDepart' });
Zone.hasMany(Tarif, { foreignKey: 'zoneArriveeId', as: 'tarifsArrivee' });
Tarif.belongsTo(Zone, { foreignKey: 'zoneDepartId', as: 'zoneDepart' });
Tarif.belongsTo(Zone, { foreignKey: 'zoneArriveeId', as: 'zoneArrivee' });

ServiceExpedition.hasMany(Surcharge, { foreignKey: 'serviceId', as: 'surcharges' });
Surcharge.belongsTo(ServiceExpedition, { foreignKey: 'serviceId', as: 'service' });

/* ────────────────────────────────────────────────────────────────────────────
 * Expédition
 * ────────────────────────────────────────────────────────────────────────── */

User.hasMany(Colis, { foreignKey: 'userId', onDelete: 'CASCADE' });
Colis.belongsTo(User, { foreignKey: 'userId', as: 'client' });
Colis.belongsTo(User, { foreignKey: 'creePar', as: 'auteurCreation' });

Colis.belongsTo(ServiceExpedition, { foreignKey: 'serviceId', as: 'service' });
ServiceExpedition.hasMany(Colis, { foreignKey: 'serviceId', as: 'expeditions' });

Ville.hasMany(Colis, { foreignKey: 'villeDepartId', as: 'colisDepart' });
Colis.belongsTo(Ville, { foreignKey: 'villeDepartId', as: 'villeDepart' });
Ville.hasMany(Colis, { foreignKey: 'villeArriveeId', as: 'colisArrivee' });
Colis.belongsTo(Ville, { foreignKey: 'villeArriveeId', as: 'villeArrivee' });

// Points d'entrée, de sortie et de localisation courante dans le réseau
PointCollecte.hasMany(Colis, { foreignKey: 'pointCollecteDepartId', as: 'colisDeposes' });
Colis.belongsTo(PointCollecte, { foreignKey: 'pointCollecteDepartId', as: 'pointCollecteDepart' });
PointCollecte.hasMany(Colis, { foreignKey: 'pointRetraitId', as: 'colisARetirer' });
Colis.belongsTo(PointCollecte, { foreignKey: 'pointRetraitId', as: 'pointRetrait' });
PointCollecte.hasMany(Colis, { foreignKey: 'pointActuelId', as: 'colisEnStockList' });
Colis.belongsTo(PointCollecte, { foreignKey: 'pointActuelId', as: 'pointActuel' });

// Coursiers d'enlèvement et de distribution
Colis.belongsTo(User, { foreignKey: 'coursierEnlevementId', as: 'coursierEnlevement' });
Colis.belongsTo(User, { foreignKey: 'coursierLivraisonId', as: 'coursierLivraison' });

Colis.hasMany(ColisPiece, { foreignKey: 'colisId', as: 'pieces', onDelete: 'CASCADE' });
ColisPiece.belongsTo(Colis, { foreignKey: 'colisId', as: 'colis' });

Colis.hasMany(SuiviColis, { foreignKey: 'colisId', as: 'historique', onDelete: 'CASCADE' });
SuiviColis.belongsTo(Colis, { foreignKey: 'colisId' });
SuiviColis.belongsTo(ColisPiece, { foreignKey: 'colisPieceId', as: 'piece' });
SuiviColis.belongsTo(User, { foreignKey: 'createdBy', as: 'auteur' });
SuiviColis.belongsTo(PointCollecte, { foreignKey: 'pointCollecteId', as: 'point' });

Rotation.hasMany(Colis, { foreignKey: 'rotationId', as: 'colis' });
Colis.belongsTo(Rotation, { foreignKey: 'rotationId', as: 'rotation' });
Rotation.belongsTo(PointCollecte, { foreignKey: 'hubDepartId', as: 'hubDepart' });
Rotation.belongsTo(PointCollecte, { foreignKey: 'hubArriveeId', as: 'hubArrivee' });
Rotation.belongsTo(User, { foreignKey: 'creePar', as: 'auteur' });

User.hasMany(DemandeEnlevement, {
  foreignKey: 'userId',
  as: 'demandesEnlevement',
  onDelete: 'CASCADE',
});
DemandeEnlevement.belongsTo(User, { foreignKey: 'userId', as: 'client' });
DemandeEnlevement.belongsTo(User, { foreignKey: 'coursierId', as: 'coursier' });
DemandeEnlevement.belongsTo(Ville, { foreignKey: 'villeId', as: 'ville' });
DemandeEnlevement.belongsTo(PointCollecte, { foreignKey: 'pointDepotId', as: 'pointDepot' });
DemandeEnlevement.belongsTo(Colis, { foreignKey: 'colisId', as: 'colis' });
Colis.hasOne(DemandeEnlevement, { foreignKey: 'colisId', as: 'enlevement' });

Colis.hasOne(PreuveLivraison, {
  foreignKey: 'colisId',
  as: 'preuveLivraison',
  onDelete: 'CASCADE',
});
PreuveLivraison.belongsTo(Colis, { foreignKey: 'colisId' });
PreuveLivraison.belongsTo(User, { foreignKey: 'remisPar', as: 'agent' });
PreuveLivraison.belongsTo(PointCollecte, { foreignKey: 'pointRetraitId', as: 'pointRetrait' });

Colis.hasMany(AbonnementSuivi, { foreignKey: 'colisId', as: 'abonnements', onDelete: 'CASCADE' });
AbonnementSuivi.belongsTo(Colis, { foreignKey: 'colisId' });

/* ────────────────────────────────────────────────────────────────────────────
 * Douane
 * ────────────────────────────────────────────────────────────────────────── */

Colis.hasOne(DeclarationDouane, {
  foreignKey: 'colisId',
  as: 'declarationDouane',
  onDelete: 'CASCADE',
});
DeclarationDouane.belongsTo(Colis, { foreignKey: 'colisId', as: 'colis' });

DeclarationDouane.hasMany(ArticleDouane, {
  foreignKey: 'declarationId',
  as: 'articles',
  onDelete: 'CASCADE',
});
ArticleDouane.belongsTo(DeclarationDouane, { foreignKey: 'declarationId', as: 'declaration' });

/* ────────────────────────────────────────────────────────────────────────────
 * Facturation
 * ────────────────────────────────────────────────────────────────────────── */

Colis.hasOne(Facture, { foreignKey: 'colisId', as: 'facture', onDelete: 'CASCADE' });
Facture.belongsTo(Colis, { foreignKey: 'colisId', as: 'colis' });
User.hasMany(Facture, { foreignKey: 'userId' });
Facture.belongsTo(User, { foreignKey: 'userId' });
Facture.belongsTo(User, { foreignKey: 'emisePar', as: 'emetteur' });

// Une facture peut recevoir plusieurs règlements (acompte puis solde)
Facture.hasMany(Paiement, { foreignKey: 'factureId', as: 'paiements', onDelete: 'CASCADE' });
Paiement.belongsTo(Facture, { foreignKey: 'factureId', as: 'facture' });
User.hasMany(Paiement, { foreignKey: 'userId' });
Paiement.belongsTo(User, { foreignKey: 'userId' });
Paiement.belongsTo(User, { foreignKey: 'recordedBy', as: 'enregistrePar' });
Paiement.belongsTo(PointCollecte, { foreignKey: 'pointCollecteId', as: 'pointEncaissement' });

/* ────────────────────────────────────────────────────────────────────────────
 * Relation client
 * ────────────────────────────────────────────────────────────────────────── */

User.hasMany(Reclamation, { foreignKey: 'userId', as: 'reclamations', onDelete: 'CASCADE' });
Reclamation.belongsTo(User, { foreignKey: 'userId', as: 'client' });
Reclamation.belongsTo(User, { foreignKey: 'assigneA', as: 'agentAssigne' });
Reclamation.belongsTo(Colis, { foreignKey: 'colisId', as: 'colis' });
Colis.hasMany(Reclamation, { foreignKey: 'colisId', as: 'reclamations' });

Reclamation.hasMany(MessageReclamation, {
  foreignKey: 'reclamationId',
  as: 'messages',
  onDelete: 'CASCADE',
});
MessageReclamation.belongsTo(Reclamation, { foreignKey: 'reclamationId' });
MessageReclamation.belongsTo(User, { foreignKey: 'auteurId', as: 'auteur' });

User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(ActivityLog, { foreignKey: 'userId', onDelete: 'SET NULL' });
ActivityLog.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  // Comptes
  User,
  RefreshToken,
  UserOtp,
  TokenBlacklist,
  Adresse,
  // Référentiels
  ParametreSysteme,
  Zone,
  Ville,
  PointCollecte,
  JourFerie,
  // Offre
  ServiceExpedition,
  Tarif,
  Surcharge,
  // Expédition
  Colis,
  ColisPiece,
  SuiviColis,
  Rotation,
  DemandeEnlevement,
  PreuveLivraison,
  AbonnementSuivi,
  // Douane
  DeclarationDouane,
  ArticleDouane,
  // Facturation
  Facture,
  Paiement,
  // Relation client
  Reclamation,
  MessageReclamation,
  Notification,
  ActivityLog,
};
