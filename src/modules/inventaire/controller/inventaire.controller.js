const service = require('../service/inventaire.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok } = require('../../../utils/response');
const { envoyerCsv } = require('../../../utils/csv');

/** Inventaire d'un chargement : ?rotationId=…&tourneeCollecteId=…&format=json|csv|html */
exports.getInventaire = asyncHandler(async (req, res) => {
  const format = req.query.format || 'json';
  if (format === 'csv') {
    const result = await service.exporterCsv(req.query);
    return envoyerCsv(res, result.contenu, result.nomFichier);
  }
  if (format === 'html') {
    const result = await service.getDocument(req.query);
    res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
    return res.status(200).type('html').send(result.html);
  }
  const result = await service.getInventaire(req.query);
  return ok(res, { inventaire: result.inventaire }, result.message);
});
