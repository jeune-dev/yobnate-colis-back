const { Op } = require('sequelize');

const currentYear = () => new Date().getFullYear();

const nextSequence = async (model, prefix) => {
  const year = currentYear();
  const like = `${prefix}-${year}-%`;
  const last = await model.findOne({
    where: { reference: { [Op.like]: like } },
    order: [['reference', 'DESC']]
  });
  const lastSeq = last ? parseInt(last.reference.split('-').pop(), 10) : 0;
  const nextSeq = String(lastSeq + 1).padStart(5, '0');
  return `${prefix}-${year}-${nextSeq}`;
};

const genererRefColis = (Colis) => nextSequence(Colis, 'YBC-COL');
const genererRefFacture = (Facture) => nextSequence(Facture, 'YBC-FAC');

module.exports = { genererRefColis, genererRefFacture };
