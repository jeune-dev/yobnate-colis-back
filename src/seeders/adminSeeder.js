require('dotenv').config();
const bcrypt = require('bcrypt');
const {
  sequelize,
  User,
  Ville,
  ServiceExpedition,
  Tarif,
  PointCollecte,
  JourFerie,
} = require('../models');
const { bcryptConfig } = require('../config/security');
const logger = require('../config/logger');
const parametreService = require('../services/parametre.service');

/**
 * Amorçage des données de référence indispensables au démarrage du service :
 * super administrateur, paramètres système, villes desservies, catalogue de
 * services, grille tarifaire de base et premiers points de collecte.
 *
 * Villes récupérées via l'API publique CountriesNow (pas de clé requise) :
 * - Sénégal : liste complète des villes (une quarantaine, exploitable telle quelle)
 * - France : l'API expose ~35 000 communes -> on ne garde que les plus peuplées,
 *   sinon la liste déroulante serait inutilisable côté client
 */
const CITIES_API = 'https://countriesnow.space/api/v0.1/countries/cities/q';
const POPULATION_API = 'https://countriesnow.space/api/v0.1/countries/population/cities/filter/q';
const MAX_VILLES_FRANCE = 100;

const normaliserNomVille = (nom) => {
  const propre = nom.trim();
  if (propre !== propre.toUpperCase()) return propre; // déjà correctement casé (ex: "Saint-Louis")
  return propre.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());
};

const fetchVillesSenegal = async () => {
  const res = await fetch(`${CITIES_API}?country=${encodeURIComponent('Senegal')}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.msg);
  const noms = json.data
    .filter((nom) => !/department/i.test(nom)) // entrées administratives renvoyées par l'API, pas des villes
    .map(normaliserNomVille);
  return [...new Set(noms)];
};

const fetchVillesFrance = async () => {
  const url = `${POPULATION_API}?limit=${MAX_VILLES_FRANCE}&order=desc&orderBy=populationCounts&country=${encodeURIComponent('France')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.msg);
  const noms = json.data.map((entry) => normaliserNomVille(entry.city));
  return [...new Set(noms)];
};

const PAYS = [
  { code: 'SN', libelle: 'Sénégal', fetchNoms: fetchVillesSenegal },
  { code: 'FR', libelle: 'France', fetchNoms: fetchVillesFrance },
];

/* ── Super administrateur ───────────────────────────────────────────────── */

const seedSuperAdmin = async () => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD manquants, super admin non créé.');
    return;
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    logger.info('Super admin déjà existant, aucune action.');
    return;
  }

  const hashed = await bcrypt.hash(password, bcryptConfig.saltRounds);
  await User.create({
    nom: process.env.SUPER_ADMIN_NOM || 'Admin',
    prenom: process.env.SUPER_ADMIN_PRENOM || 'Yobnate',
    email,
    password: hashed,
    telephone: '+221770000001',
    role: 'super_admin',
    pays: 'SN',
    isActive: true,
  });
  logger.info(`Super admin créé : ${email}`);
};

/* ── Paramètres système ─────────────────────────────────────────────────── */

const seedParametres = async () => {
  const result = await parametreService.initialiser();
  logger.info(result.message);
};

/* ── Villes ─────────────────────────────────────────────────────────────── */

const seedVilles = async () => {
  const villes = {};

  for (const pays of PAYS) {
    let noms;
    try {
      noms = await pays.fetchNoms();
    } catch (err) {
      logger.warn(`Villes ${pays.libelle} non récupérées via l'API (${err.message}).`);
      noms = [];
    }

    for (const nom of noms) {
      const data = { nom, pays: pays.code };
      const [ville] = await Ville.findOrCreate({ where: data, defaults: data });
      villes[`${pays.code}:${nom}`] = ville;
    }
  }

  logger.info(`${Object.keys(villes).length} villes disponibles (Sénégal + France).`);
  return villes;
};

/* ── Catalogue de services ──────────────────────────────────────────────── */

const seedServices = async () => {
  const services = {};

  const [standard] = await ServiceExpedition.findOrCreate({
    where: { code: 'STD' },
    defaults: {
      code: 'STD',
      nom: 'Standard',
      description: 'Acheminement économique entre la France et le Sénégal.',
      modeTransport: 'maritime',
      delaiMinJours: 15,
      delaiMaxJours: 30,
      joursOuvresUniquement: true,
      coefficientVolumetrique: 5000,
      poidsMinKg: 0.5,
      poidsMaxKg: 100,
      dimensionsMaxCm: 300,
      assuranceIncluse: 0,
      ordreAffichage: 2,
      isActive: true,
    },
  });
  services.STD = standard;

  const [express] = await ServiceExpedition.findOrCreate({
    where: { code: 'EXP' },
    defaults: {
      code: 'EXP',
      nom: 'Express',
      description: 'Acheminement rapide par voie aérienne entre la France et le Sénégal.',
      modeTransport: 'aerien',
      delaiMinJours: 2,
      delaiMaxJours: 5,
      joursOuvresUniquement: true,
      heureLimiteDepot: '15:00',
      coefficientVolumetrique: 5000,
      poidsMinKg: 0.1,
      poidsMaxKg: 70,
      dimensionsMaxCm: 200,
      assuranceIncluse: 50000,
      ordreAffichage: 1,
      isActive: true,
    },
  });
  services.EXP = express;

  logger.info('Catalogue de services initialisé (Standard, Express).');
  return services;
};

/* ── Grille tarifaire de base ───────────────────────────────────────────── */

const TRANCHES_BASE = [
  { poidsMinKg: 0, poidsMaxKg: 5, prixBaseXof: 15000, prixBaseEur: 25 },
  { poidsMinKg: 5, poidsMaxKg: 20, prixBaseXof: 45000, prixBaseEur: 70 },
  { poidsMinKg: 20, poidsMaxKg: 70, prixBaseXof: 120000, prixBaseEur: 180 },
];

const seedTarifs = async (services) => {
  const corridors = [
    { depart: 'SN', arrivee: 'FR', devise: 'XOF', cle: 'prixBaseXof', kgSup: 2500 },
    { depart: 'FR', arrivee: 'SN', devise: 'EUR', cle: 'prixBaseEur', kgSup: 4 },
  ];

  let crees = 0;
  for (const service of Object.values(services)) {
    for (const corridor of corridors) {
      for (const tranche of TRANCHES_BASE) {
        const multiplicateur = service.code === 'EXP' ? 1.6 : 1;
        const [, cree] = await Tarif.findOrCreate({
          where: {
            serviceId: service.id,
            paysDepart: corridor.depart,
            paysArrivee: corridor.arrivee,
            poidsMinKg: tranche.poidsMinKg,
            poidsMaxKg: tranche.poidsMaxKg,
          },
          defaults: {
            serviceId: service.id,
            paysDepart: corridor.depart,
            paysArrivee: corridor.arrivee,
            poidsMinKg: tranche.poidsMinKg,
            poidsMaxKg: tranche.poidsMaxKg,
            prixBase: Math.round(tranche[corridor.cle] * multiplicateur),
            poidsInclusKg: tranche.poidsMinKg,
            prixParKgSupplementaire: Math.round(corridor.kgSup * multiplicateur),
            devise: corridor.devise,
            montantMinimum: 0,
            isActive: true,
          },
        });
        if (cree) crees += 1;
      }
    }
  }
  logger.info(`${crees} ligne(s) de grille tarifaire créée(s).`);
};

/* ── Points de collecte de départ ───────────────────────────────────────── */

const seedPointsCollecte = async (villes) => {
  const points = [
    {
      code: 'SN-DKR-01',
      nom: 'Agence Yobnate Dakar Plateau',
      type: 'agence',
      pays: 'SN',
      villeCle: 'SN:Dakar',
      adresse: 'Avenue Léopold Sédar Senghor, Plateau',
      telephone: '+221770000002',
      services: ['depot', 'retrait', 'paiement', 'emballage', 'pesee', 'declaration_douane'],
    },
    {
      code: 'FR-PAR-01',
      nom: 'Agence Yobnate Paris',
      type: 'agence',
      pays: 'FR',
      villeCle: 'FR:Paris',
      adresse: '10 Rue de la Paix, 75002 Paris',
      telephone: '+33100000002',
      services: ['depot', 'retrait', 'paiement', 'emballage', 'pesee', 'declaration_douane'],
    },
  ];

  let crees = 0;
  for (const point of points) {
    const ville = villes[point.villeCle];
    if (!ville) {
      logger.warn(
        `Point ${point.code} ignoré : ville ${point.villeCle} introuvable (API villes indisponible).`
      );
      continue;
    }
    const [, cree] = await PointCollecte.findOrCreate({
      where: { code: point.code },
      defaults: {
        code: point.code,
        nom: point.nom,
        type: point.type,
        pays: point.pays,
        villeId: ville.id,
        adresse: point.adresse,
        telephone: point.telephone,
        services: point.services,
        capaciteMaxColis: 500,
        delaiGardeJours: 15,
        visiblePublic: true,
        isActive: true,
      },
    });
    if (cree) crees += 1;
  }
  logger.info(`${crees} point(s) de collecte créé(s).`);
};

/* ── Jours fériés récurrents ─────────────────────────────────────────────── */

const seedJoursFeries = async () => {
  const feries = [
    { date: '2026-01-01', pays: 'SN', libelle: "Jour de l'An", recurrent: true },
    { date: '2026-04-04', pays: 'SN', libelle: "Fête de l'Indépendance", recurrent: true },
    { date: '2026-05-01', pays: 'SN', libelle: 'Fête du Travail', recurrent: true },
    { date: '2026-12-25', pays: 'SN', libelle: 'Noël', recurrent: true },
    { date: '2026-01-01', pays: 'FR', libelle: "Jour de l'An", recurrent: true },
    { date: '2026-05-01', pays: 'FR', libelle: 'Fête du Travail', recurrent: true },
    { date: '2026-07-14', pays: 'FR', libelle: 'Fête Nationale', recurrent: true },
    { date: '2026-12-25', pays: 'FR', libelle: 'Noël', recurrent: true },
  ];

  let crees = 0;
  for (const ferie of feries) {
    const [, cree] = await JourFerie.findOrCreate({
      where: { date: ferie.date, pays: ferie.pays },
      defaults: ferie,
    });
    if (cree) crees += 1;
  }
  logger.info(`${crees} jour(s) férié(s) créé(s).`);
};

/* ── Orchestration ──────────────────────────────────────────────────────── */

const run = async () => {
  await sequelize.authenticate();
  await seedSuperAdmin();
  await seedParametres();
  const villes = await seedVilles();
  const services = await seedServices();
  await seedTarifs(services);
  await seedPointsCollecte(villes);
  await seedJoursFeries();
  await sequelize.close();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Échec du seed : ${err.message}`);
    process.exit(1);
  });
