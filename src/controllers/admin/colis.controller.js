const service = require('../../services/admin/colis.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await service.getAllColis(req.query, req.query);
  return ok(res, { colis: result.colis, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await service.getColisById(req.params.id);
  return ok(res, { colis: result.colis }, result.message);
});

exports.rechercher = asyncHandler(async (req, res) => {
  const result = await service.rechercherParNumero(req.params.numero);
  return ok(res, { colis: result.colis }, result.message);
});

exports.enregistrerEvenement = asyncHandler(async (req, res) => {
  const result = await service.enregistrerEvenement(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis, evenement: result.evenement }, result.message);
});

exports.enregistrerEvenementLot = asyncHandler(async (req, res) => {
  const { colisIds, ...params } = req.body;
  const result = await service.enregistrerEvenementEnLot(colisIds, params, req.user.id);
  return ok(res, { traites: result.traites, erreurs: result.erreurs }, result.message);
});

exports.corrigerPesee = asyncHandler(async (req, res) => {
  const result = await service.corrigerPesee(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis, devis: result.devis, ecart: result.ecart }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await service.updateColis(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis }, result.message);
});

exports.changerPointRetrait = asyncHandler(async (req, res) => {
  const result = await service.changerPointRetrait(
    req.params.id,
    req.body.pointRetraitId,
    req.user.id,
    req.body.motif
  );
  return ok(res, { colis: result.colis }, result.message);
});

exports.affecterCoursier = asyncHandler(async (req, res) => {
  const result = await service.affecterCoursier(req.params.id, req.body, req.user.id);
  return ok(res, { colis: result.colis }, result.message);
});

exports.regenererCodeRetrait = asyncHandler(async (req, res) => {
  const result = await service.regenererCodeRetrait(req.params.id, req.user.id);
  return ok(res, { codeRetrait: result.codeRetrait }, result.message);
});

exports.ajouterNoteInterne = asyncHandler(async (req, res) => {
  const result = await service.ajouterNoteInterne(req.params.id, req.body.note, req.user.id);
  return ok(res, null, result.message);
});

exports.ajouterPhotos = asyncHandler(async (req, res) => {
  const result = await service.ajouterPhotos(req.params.id, req.files || [], req.user.id);
  return ok(res, { colis: result.colis }, result.message);
});

exports.etiquettes = asyncHandler(async (req, res) => {
  const result = await service.getEtiquettes(req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.bordereau = asyncHandler(async (req, res) => {
  const result = await service.getBordereau(req.params.id);
  res.setHeader('Content-Disposition', `inline; filename="${result.nomFichier}"`);
  return res.status(200).type('html').send(result.html);
});

exports.statistiques = asyncHandler(async (req, res) => {
  const result = await service.getStatistiques(req.query);
  return ok(res, { statistiques: result.statistiques }, result.message);
});

exports.exporter = asyncHandler(async (req, res) => {
  const result = await service.exporterCsv(req.query);
  const { envoyerCsv } = require('../../utils/csv');
  return envoyerCsv(res, result.contenu, result.nomFichier);
});

exports.codesEvenements = asyncHandler((req, res) => {
  const result = service.getCodesEvenements();
  return ok(res, { evenements: result.evenements }, result.message);
});
