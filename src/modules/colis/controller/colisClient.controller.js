const service = require('../service/colisClient.service');
const declarationService = require('../service/colisDeclaration.service');
const asyncHandler = require('../../../middlewares/asyncHandler');
const { ok, created } = require('../../../utils/response');

exports.devis = asyncHandler(async (req, res) => {
  const result = await declarationService.simulerDevis(req.body, req.user?.id || null);
  return ok(res, { devis: result.devis }, result.message);
});

exports.declarer = asyncHandler(async (req, res) => {
  const result = await declarationService.declarerExpedition(
    req.user.id,
    req.body,
    req.files || []
  );
  return created(
    res,
    {
      colis: result.colis,
      facture: result.facture,
      declarationDouane: result.declarationDouane,
      enlevement: result.enlevement,
      devis: result.devis,
      lienPaiement: result.lienPaiement,
      adresseReception: result.adresseReception,
    },
    result.message
  );
});

exports.getMes = asyncHandler(async (req, res) => {
  const result = await service.getMesExpeditions(req.user.id, req.query, req.query);
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

exports.getRecus = asyncHandler(async (req, res) => {
  const result = await service.getMesReceptions(req.user.id, req.query, req.query);
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

exports.modifier = asyncHandler(async (req, res) => {
  const result = await service.modifierExpedition(req.user.id, req.params.id, req.body);
  return ok(res, { colis: result.colis }, result.message);
});

exports.accepterProposition = asyncHandler(async (req, res) => {
  const result = await service.accepterProposition(req.user.id, req.params.id);
  return ok(
    res,
    { colis: result.colis, facture: result.facture, lienPaiement: result.lienPaiement },
    result.message
  );
});

exports.refuserProposition = asyncHandler(async (req, res) => {
  const result = await service.refuserProposition(req.user.id, req.params.id, req.body.motif);
  return ok(res, { colis: result.colis }, result.message);
});

exports.deposerVocal = asyncHandler(async (req, res) => {
  const result = await service.deposerVocal(req.user.id, req.params.id, req.files?.vocal?.[0]);
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
