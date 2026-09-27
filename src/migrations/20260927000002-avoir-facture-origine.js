'use strict';

/**
 * Lien d'un avoir vers la facture qu'il compense (factures."factureOrigineId").
 *
 * Sans ce lien, le back-office pouvait émettre autant d'avoirs qu'il le voulait sur
 * une même facture, chacun jusqu'à son montant total, et deux émissions simultanées
 * n'étaient pas sérialisées. Le service vérifie désormais, sous verrou de la facture
 * d'origine, que le cumul des avoirs n'excède pas son total.
 *
 * Les avoirs existants sont rattachés à leur facture d'après la mention figée à leur
 * émission (« Avoir émis sur la facture <référence> »).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('factures');
    if (!colonnes.factureOrigineId) {
      await queryInterface.addColumn('factures', 'factureOrigineId', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'factures', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "factures_facture_origine_id" ON factures ("factureOrigineId")
        WHERE "factureOrigineId" IS NOT NULL`
    );
    await queryInterface.sequelize.query(
      `UPDATE factures a SET "factureOrigineId" = f.id
         FROM factures f
        WHERE a.type = 'avoir' AND a."factureOrigineId" IS NULL
          AND a.mentions = 'Avoir émis sur la facture ' || f.reference`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "factures_facture_origine_id"');
    const colonnes = await queryInterface.describeTable('factures');
    if (colonnes.factureOrigineId)
      await queryInterface.removeColumn('factures', 'factureOrigineId');
  },
};
