const service = require('../../services/client/colis.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');

exports.devis = asyncHandler(async (req, res) => {
  const result = await service.simulerDevis(req.body, req.user?.id || null);
  return ok(res, { devis: result.devis }, result.message);
});

exports.declarer = asyncHandler(async (req, res) => {
  const result = await service.declarerExpedition(req.user.id, req.body, req.files || []);
  return created(
    res,
    {
      colis: result.colis,
      facture: result.facture,
      declarationDouane: result.declarationDouane,
      devis: result.devis,
    },
    result.message
  );
});

exports.getMes = asyncHandler(async (req, res) => {
  const result = await service.getMesExpeditions(req.user.id, req.query, req.query);
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getExpeditionById(req.user.id, req.params.id);
  return ok(res, { colis: result.colis }, result.message);
});

exports.suivi = asyncHandler(async (req, res) => {
  const result = await service.getSuivi(req.user.id, req.params.id);
  return ok(res, { historique: result.historique }, result.message);
});

exports.annuler = asyncHandler(async (req, res) => {
  const result = await service.annulerExpedition(req.user.id, req.params.id, req.body.motif);
  return ok(res, { colis: result.colis }, result.message);
});

exports.ajouterPhotos = asyncHandler(async (req, res) => {
  const result = await service.ajouterPhotos(req.user.id, req.params.id, req.files || []);
  return ok(res, { colis: result.colis }, result.message);
});

exports.abonnerSuivi = asyncHandler(async (req, res) => {
  const result = await service.abonnerAuSuivi(req.user.id, req.params.id, req.body);
  return ok(res, { abonnement: result.abonnement }, result.message);
});

exports.etiquettes = asyncHandler(async (req, res) => {
  const result = await service.getEtiquettes(req.user.id, req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.bordereau = asyncHandler(async (req, res) => {
  const result = await service.getBordereau(req.user.id, req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.factureCommerciale = asyncHandler(async (req, res) => {
  const result = await service.getFactureCommerciale(req.user.id, req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});
