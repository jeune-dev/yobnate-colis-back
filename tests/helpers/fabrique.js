/**
 * Données de départ des tests d'intégration.
 *
 * Chaque appel produit des identifiants uniques (email, téléphone, codes) : les
 * suites ne dépendent jamais de l'ordre d'exécution ni des données d'une autre.
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');
const models = require('../../src/models');
const AuthService = require('../../src/modules/auth/service/auth.service');

const MOT_DE_PASSE = 'Motdepasse1!';
let hashMotDePasse = null;

const suffixe = () => randomUUID().replace(/-/g, '').slice(0, 10);
const telephoneUnique = () => `+22177${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

const creerUtilisateur = async (champs = {}) => {
  hashMotDePasse = hashMotDePasse || (await bcrypt.hash(MOT_DE_PASSE, 4));
  const id = suffixe();
  return models.User.create({
    nom: 'Test',
    prenom: `Utilisateur${id.slice(0, 4)}`,
    email: `u-${id}@exemple.com`,
    telephone: telephoneUnique(),
    password: hashMotDePasse,
    role: 'client',
    emailVerifie: true,
    ...champs,
  });
};

/** En-tête Authorization d'un compte, émis par le vrai service d'authentification. */
const jeton = async (user) => {
  const { accessToken } = await AuthService.issueTokens(user);
  return `Bearer ${accessToken}`;
};

const creerVille = (champs = {}) =>
  models.Ville.create({ nom: `Ville ${suffixe()}`, pays: 'SN', ...champs });

const creerService = (champs = {}) =>
  models.ServiceExpedition.create({ code: `S${suffixe()}`, nom: 'Service test', ...champs });

const creerPoint = async (champs = {}) => {
  const ville = champs.villeId ? null : await creerVille({ pays: champs.pays || 'SN' });
  return models.PointCollecte.create({
    code: `P${suffixe()}`,
    nom: `Point ${suffixe()}`,
    pays: 'SN',
    villeId: ville?.id,
    adresse: '1 rue du Test',
    services: ['depot', 'retrait', 'paiement'],
    ...champs,
  });
};

/** Colis minimal valide ; le trajet France → Sénégal est créé à la volée. */
const creerColis = async (client, champs = {}) => {
  const [villeDepart, villeArrivee, service] = await Promise.all([
    creerVille({ pays: 'FR' }),
    creerVille({ pays: 'SN' }),
    creerService(),
  ]);
  return models.Colis.create({
    reference: `T-${suffixe().toUpperCase()}`,
    userId: client.id,
    serviceId: service.id,
    expediteurNom: 'Expéditeur Test',
    expediteurTelephone: '+33612345678',
    paysDepart: 'FR',
    villeDepartId: villeDepart.id,
    destinataireNom: 'Destinataire Test',
    destinataireTelephone: '+221770000000',
    paysArrivee: 'SN',
    villeArriveeId: villeArrivee.id,
    poidsReelKg: 5,
    poidsFactureKg: 5,
    montantTotal: 100,
    devise: 'EUR',
    statut: 'en_attente',
    ...champs,
  });
};

const creerFacture = (colis, champs = {}) =>
  models.Facture.create({
    reference: `F-${suffixe().toUpperCase()}`,
    colisId: colis.id,
    userId: colis.userId,
    devise: colis.devise,
    montantTotal: colis.montantTotal,
    montantPaye: 0,
    statut: 'en_attente',
    ...champs,
  });

const creerEmballage = (champs = {}) =>
  models.Emballage.create({ code: `E${suffixe()}`, libelle: 'Carton test', prix: 5, ...champs });

module.exports = {
  models,
  MOT_DE_PASSE,
  suffixe,
  telephoneUnique,
  creerUtilisateur,
  jeton,
  creerVille,
  creerService,
  creerPoint,
  creerColis,
  creerFacture,
  creerEmballage,
};
