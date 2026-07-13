const sequelize = require('../config/db');

const currentYear = () => new Date().getFullYear();

// Utilise une séquence PostgreSQL par préfixe+année — atomique, sans race condition
const nextSequence = async (prefix) => {
  const year = currentYear();
  const seqName = `${prefix.toLowerCase().replace(/-/g, '_')}_${year}_seq`;
  await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS "${seqName}" START 1`);
  const [[{ nextval }]] = await sequelize.query(`SELECT nextval('"${seqName}"') AS nextval`);
  return `${prefix}-${year}-${String(nextval).padStart(5, '0')}`;
};

// Les paramètres model sont conservés pour compatibilité avec les appelants existants
const genererRefColis = (_Colis) => nextSequence('YBC-COL');
const genererRefFacture = (_Facture) => nextSequence('YBC-FAC');

module.exports = { genererRefColis, genererRefFacture };
