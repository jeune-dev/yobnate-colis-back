/* eslint-disable no-console -- script en ligne de commande : la sortie standard est son interface */
/**
 * Vérifie que la base (construite par les MIGRATIONS) contient toutes les
 * tables et colonnes déclarées par les modèles Sequelize.
 *
 * Une colonne ajoutée à un modèle sans migration fonctionne en développement
 * (sync) puis casse en production (« column does not exist ») : ce contrôle,
 * exécuté par la CI après `npm run migrate` sur une base vierge, l'empêche.
 *
 * Usage : npm run migrate && node scripts/verifierSchema.js
 */
require('dotenv').config();

const { sequelize } = require('../src/models');

const verifier = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = new Set(await qi.showAllTables());
  const ecarts = [];

  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    const nom = typeof table === 'string' ? table : table.tableName;
    if (!tables.has(nom)) {
      ecarts.push(`table absente : ${nom}`);
      continue;
    }
    const colonnes = await qi.describeTable(nom);
    for (const [attribut, def] of Object.entries(model.rawAttributes)) {
      const colonne = def.field || attribut;
      if (!colonnes[colonne]) ecarts.push(`colonne absente : ${nom}.${colonne}`);
    }
  }
  return ecarts;
};

verifier()
  .then(async (ecarts) => {
    await sequelize.close();
    if (ecarts.length) {
      console.error(`✗ Schéma incomplet — migration manquante :\n  ${ecarts.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`✔ Schéma conforme aux ${Object.keys(sequelize.models).length} modèles`);
  })
  .catch(async (err) => {
    console.error('✗ Vérification impossible :', err.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
