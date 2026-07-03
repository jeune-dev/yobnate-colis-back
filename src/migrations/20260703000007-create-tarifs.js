'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tarifs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      villeDepartId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'villes', key: 'id' },
        onDelete: 'CASCADE'
      },
      villeArriveeId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'villes', key: 'id' },
        onDelete: 'CASCADE'
      },
      typeColis: { type: Sequelize.ENUM('standard', 'express', 'fragile'), allowNull: false, defaultValue: 'standard' },
      prixParKg: { type: Sequelize.DECIMAL(8, 2), allowNull: false },
      prixFixe: { type: Sequelize.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      delaiEstimeJours: { type: Sequelize.SMALLINT, allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
    });
    await queryInterface.addIndex('tarifs', ['villeDepartId', 'villeArriveeId', 'typeColis'], { unique: true, name: 'tarifs_trajet_type_unique' });
    await queryInterface.addIndex('tarifs', ['isActive']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tarifs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_tarifs_typeColis";');
  }
};
