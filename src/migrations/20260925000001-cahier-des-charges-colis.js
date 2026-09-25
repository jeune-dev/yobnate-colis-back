'use strict';

/**
 * Évolution du schéma pour le cahier des charges « Expédition de colis » :
 * catégories 1/2/3, grille forfaitaire, emballages, tournées de collecte,
 * annonces, modèles d'emails, parrainage, vérification de l'email…
 *
 * Comme la migration initiale, celle-ci s'appuie sur les modèles qui font foi,
 * mais de façon strictement additive, pour pouvoir être rejouée sur une base
 * déjà peuplée sans perte de données :
 *   1. ajout des colonnes absentes des tables existantes ;
 *   2. ajout des valeurs manquantes aux types ENUM existants ;
 *   3. création des tables et des index absents.
 * Aucune colonne n'est supprimée ni retypée.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const { sequelize } = require('../models');
    const { DataTypes } = require('sequelize');

    // Les colonnes sont ajoutées AVANT sync() : sync() crée aussi les index
    // manquants des tables existantes, qui peuvent porter sur ces nouvelles colonnes.
    for (const model of Object.values(sequelize.models)) {
      const table = model.getTableName();
      const nomTable = typeof table === 'string' ? table : table.tableName;
      let existantes;
      try {
        existantes = await queryInterface.describeTable(nomTable);
      } catch {
        continue; // table absente : créée plus bas par sync()
      }

      for (const [attribut, definition] of Object.entries(model.rawAttributes)) {
        const colonne = definition.field || attribut;

        // 1. Colonnes absentes — le type ENUM est créé à la volée par Sequelize
        if (!existantes[colonne]) {
          await queryInterface.addColumn(nomTable, colonne, {
            type: definition.type,
            allowNull: definition.allowNull !== false,
            defaultValue: definition.defaultValue,
          });
          continue;
        }

        // 2. Valeurs ENUM manquantes (PostgreSQL : ADD VALUE hors transaction)
        if (definition.type instanceof DataTypes.ENUM) {
          const nomType = `enum_${nomTable}_${colonne}`;
          const [lignes] = await sequelize.query(
            `SELECT e.enumlabel AS valeur
               FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
              WHERE t.typname = :nomType`,
            { replacements: { nomType } }
          );
          if (!lignes.length) continue;
          const connues = new Set(lignes.map((l) => l.valeur));
          for (const valeur of definition.type.values) {
            if (connues.has(valeur)) continue;
            await sequelize.query(
              `ALTER TYPE "${nomType}" ADD VALUE IF NOT EXISTS '${valeur.replace(/'/g, "''")}'`
            );
          }
        }
      }
    }

    // Tables absentes, puis index déclarés dans les modèles et encore absents
    await sequelize.sync();

    // L'unicité portée par la colonne (et non par un index du modèle) n'est pas
    // ajoutée par addColumn : on la crée explicitement.
    await queryInterface
      .addIndex('users', ['codeParrainage'], { unique: true, name: 'users_code_parrainage_unique' })
      .catch(() => {});

    // Les comptes antérieurs à la confirmation d'email n'ont jamais reçu de lien :
    // ils sont considérés comme vérifiés pour ne pas être bloqués à la connexion.
    await sequelize.query('UPDATE users SET "emailVerifie" = true WHERE "emailVerifie" = false');
  },

  async down() {
    // Migration additive : un retour arrière passe par la restauration d'une sauvegarde.
  },
};
