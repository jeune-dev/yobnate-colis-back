const paiementService = require('../../services/client/paiement.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getMesFactures = asyncHandler(async (req, res) => {
  const result = await paiementService.getMesFactures(req.user.id, req.query, req.query);
  return ok(res, { factures: result.factures, pagination: result.pagination }, result.message);
});

exports.getFacture = asyncHandler(async (req, res) => {
  const result = await paiementService.getFactureById(req.user.id, req.params.id);
  return ok(res, { facture: result.facture }, result.message);
});

exports.getMesPaiements = asyncHandler(async (req, res) => {
  const result = await paiementService.getMesPaiements(req.user.id, req.query);
  return ok(res, { paiements: result.paiements, pagination: result.pagination }, result.message);
});

exports.getEncours = asyncHandler(async (req, res) => {
  const result = await paiementService.getMonEncours(req.user.id);
  return ok(res, { encours: result.encours }, result.message);
});

exports.document = asyncHandler(async (req, res) => {
  const result = await paiementService.getDocumentFacture(req.user.id, req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.methodes = asyncHandler((req, res) => {
  const result = paiementService.getMethodesPaiement(req.query.pays);
  return ok(res, { methodes: result.methodes }, result.message);
});
