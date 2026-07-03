require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize, User, Ville, Tarif } = require('../models');
const { bcryptConfig } = require('../config/security');
const logger = require('../config/logger');

const VILLES = [
  { nom: 'Dakar', region: 'Dakar' },
  { nom: 'Thiès', region: 'Thiès' },
  { nom: 'Saint-Louis', region: 'Saint-Louis' },
  { nom: 'Touba', region: 'Diourbel' },
  { nom: 'Kaolack', region: 'Kaolack' },
  { nom: 'Ziguinchor', region: 'Ziguinchor' },
  { nom: 'Mbour', region: 'Thiès' },
  { nom: 'Rufisque', region: 'Dakar' }
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
    telephone: '+221000000000',
    role: 'super_admin',
    isActive: true
  });
  logger.info(`Super admin créé : ${email}`);
};

const seedVilles = async () => {
  const villes = {};
  for (const data of VILLES) {
    const [ville] = await Ville.findOrCreate({ where: { nom: data.nom }, defaults: data });
    villes[data.nom] = ville;
  }
  logger.info(`${Object.keys(villes).length} villes disponibles.`);
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
