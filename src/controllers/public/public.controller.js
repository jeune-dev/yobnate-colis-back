const suiviService = require('../../services/suivi.service');
const pointService = require('../../services/admin/pointCollecte.service');
const serviceExpeditionService = require('../../services/admin/serviceExpedition.service');
const villeService = require('../../services/admin/ville.service');
const colisService = require('../../services/client/colis.service');
const notificationService = require('../../services/notification.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.suivi = asyncHandler(async (req, res) => {
  const result = await suiviService.getSuiviPublic(req.params.reference);
  return ok(res, { suivi: result.suivi }, result.message);
});

exports.points = asyncHandler(async (req, res) => {
  const result = await pointService.rechercherPointsPublics(req.query);
  return ok(res, { points: result.points, recherche: result.recherche }, result.message);
});

exports.services = asyncHandler(async (req, res) => {
  const result = await serviceExpeditionService.getServicesPublics();
  return ok(res, { services: result.services }, result.message);
});

exports.villes = asyncHandler(async (req, res) => {
  const result = await villeService.getVillesPubliques(req.query);
  return ok(res, { villes: result.villes }, result.message);
});

exports.devis = asyncHandler(async (req, res) => {
  const result = await colisService.simulerDevis(req.body, null);
  return ok(res, { devis: result.devis }, result.message);
});

exports.desabonner = asyncHandler(async (req, res) => {
  const result = await notificationService.desabonner(req.params.jeton);
  return ok(res, { resilie: result.resilie }, result.message);
});
