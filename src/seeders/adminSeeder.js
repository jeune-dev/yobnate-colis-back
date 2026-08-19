require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize, User, Ville, Tarif } = require('../models');
const { bcryptConfig } = require('../config/security');
const logger = require('../config/logger');

// Villes récupérées via l'API publique CountriesNow (pas de clé requise) :
// - Sénégal : liste complète des villes (une quarantaine, exploitable telle quelle)
// - France : l'API expose ~35 000 communes -> on ne garde que les plus peuplées,
//   sinon la liste déroulante serait inutilisable côté client
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
  { code: 'FR', libelle: 'France', fetchNoms: fetchVillesFrance }
];

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
    isActive: true
  });
  logger.info(`Super admin créé : ${email}`);
};

const seedVilles = async () => {
  const villes = {};

  for (const pays of PAYS) {
    let noms;
    try {
      noms = await pays.fetchNoms();
    } catch (err) {
      logger.warn(`Villes ${pays.libelle} non récupérées via l'API (${err.message}) — seule l'option "Autre" sera disponible.`);
      noms = [];
    }

    for (const nom of noms) {
      const data = { nom, pays: pays.code };
      const [ville] = await Ville.findOrCreate({ where: data, defaults: data });
      villes[nom] = ville;
    }

    // Repli quand la ville du client n'apparaît pas dans la liste
    await Ville.findOrCreate({ where: { nom: 'Autre', pays: pays.code }, defaults: { nom: 'Autre', pays: pays.code } });
  }

  logger.info(`${Object.keys(villes).length} villes disponibles (via API + option "Autre" par pays).`);
  return villes;
};

const seedTarifs = async (villes) => {
  const routes = [
    { depart: 'Dakar', arrivee: 'Thiès', prixParKg: 500, prixFixe: 1000, delai: 1 },
    { depart: 'Dakar', arrivee: 'Saint-Louis', prixParKg: 700, prixFixe: 1500, delai: 2 },
    { depart: 'Dakar', arrivee: 'Kaolack', prixParKg: 600, prixFixe: 1200, delai: 2 },
    { depart: 'Dakar', arrivee: 'Ziguinchor', prixParKg: 900, prixFixe: 2000, delai: 3 },
    { depart: 'Dakar', arrivee: 'Touba', prixParKg: 650, prixFixe: 1300, delai: 2 }
  ];

  for (const route of routes) {
    if (!villes[route.depart] || !villes[route.arrivee]) {
      // Ville manquante (API villes indisponible au moment du seed) : trajet ignoré
      logger.warn(`Tarif ${route.depart} -> ${route.arrivee} ignoré (ville introuvable).`);
      continue;
    }
    for (const typeColis of ['standard', 'express']) {
      const multiplier = typeColis === 'express' ? 1.5 : 1;
      await Tarif.findOrCreate({
        where: {
          villeDepartId: villes[route.depart].id,
          villeArriveeId: villes[route.arrivee].id,
          typeColis
        },
        defaults: {
          villeDepartId: villes[route.depart].id,
          villeArriveeId: villes[route.arrivee].id,
          typeColis,
          prixParKg: route.prixParKg * multiplier,
          prixFixe: route.prixFixe * multiplier,
          delaiEstimeJours: typeColis === 'express' ? Math.max(1, route.delai - 1) : route.delai
        }
      });
    }
  }
  logger.info('Grille tarifaire de base initialisée.');
};

const run = async () => {
  await sequelize.authenticate();
  await seedSuperAdmin();
  const villes = await seedVilles();
  await seedTarifs(villes);
  await sequelize.close();
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Échec du seed : ${err.message}`);
    process.exit(1);
  });
