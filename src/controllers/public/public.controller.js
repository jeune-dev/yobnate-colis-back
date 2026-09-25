const suiviService = require('../../services/suivi.service');
const pointService = require('../../services/admin/pointCollecte.service');
const serviceExpeditionService = require('../../services/admin/serviceExpedition.service');
const villeService = require('../../services/admin/ville.service');
const colisService = require('../../services/client/colis.service');
const notificationService = require('../../services/notification.service');
const parametreService = require('../../services/parametre.service');
const articleTarifService = require('../../services/admin/articleTarif.service');
const emballageService = require('../../services/admin/emballage.service');
const tourneeService = require('../../services/admin/tourneeCollecte.service');
const annonceService = require('../../services/admin/annonce.service');
const { REGLES_CATEGORIE } = require('../../constants/colis');
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

/**
 * Configuration publique de l'application et du site vitrine : adresses de
 * réception, liens (boutique, stores, Chronopost, mesure), contact WhatsApp,
 * produits interdits, options de collecte et grilles Colissimo.
 */
exports.configuration = asyncHandler(async (req, res) => {
  const p = await parametreService.chargerTous();
  return ok(
    res,
    {
      configuration: {
        entreprise: {
          nom: p.entreprise_nom,
          email: p.entreprise_email,
          telephone: p.entreprise_telephone,
        },
        adresseReception: { FR: p.adresse_reception_fr, SN: p.adresse_reception_sn },
        liens: {
          boutique: p.lien_app_boutique,
          android: p.lien_app_android,
          ios: p.lien_app_ios,
          chronopost: p.lien_chronopost,
          applicationMesure: p.lien_application_mesure,
          cgv: p.lien_cgv,
        },
        whatsappContact: p.whatsapp_contact,
        produitsInterdits: p.produits_interdits || [],
        collecte: {
          active: p.collecte_domicile_active,
          grilleFrance: p.grille_enlevement_domicile_fr || [],
          fraisSenegalXof: p.frais_enlevement_domicile_xof,
        },
        colissimo: { active: p.option_colissimo_active, grille: p.grille_colissimo || [] },
        prixForfaitsTtc: p.prix_forfaits_ttc,
        delaiEtudeHeures: p.delai_etude_demande_heures,
        parrainage: {
          actif: p.parrainage_actif,
          remiseFilleulPourcent: p.parrainage_remise_filleul_pourcent,
          gainParrainEur: p.parrainage_gain_parrain_eur,
        },
        remiseProfessionnellePourcent: p.remise_professionnelle_pourcent,
      },
    },
    'Configuration publique'
  );
});

/** Parcours de chaque catégorie de colis (1, 2, 3), pour guider le client. */
exports.categories = asyncHandler((req, res) =>
  ok(
    res,
    { categories: Object.entries(REGLES_CATEGORIE).map(([code, r]) => ({ code, ...r })) },
    'Catégories de colis'
  )
);

/** Page d'accueil : annonces en ligne et tournées de collecte ouvertes (bannière). */
exports.accueil = asyncHandler(async (req, res) => {
  const [annonces, tournees] = await Promise.all([
    annonceService.getEnLigne({ emplacement: req.query.emplacement }),
    tourneeService.getTourneesOuvertes(req.query),
  ]);
  return ok(
    res,
    {
      annonces: annonces.annonces,
      tourneesCollecte: tournees.tournees.filter((t) => t.afficherBanniere),
    },
    "Contenu de l'accueil"
  );
});

exports.tournees = asyncHandler(async (req, res) => {
  const result = await tourneeService.getTourneesOuvertes(req.query);
  return ok(res, { tournees: result.tournees }, result.message);
});

/** Rubrique « Nos tarifs » : grille forfaitaire Dakar / autres régions. */
exports.tarifs = asyncHandler(async (req, res) => {
  const result = await articleTarifService.getGrillePublique(req.query);
  return ok(res, { articles: result.articles }, result.message);
});

exports.emballages = asyncHandler(async (req, res) => {
  const result = await emballageService.getCataloguePublic(req.query);
  return ok(res, { emballages: result.emballages }, result.message);
});

exports.desabonner = asyncHandler(async (req, res) => {
  const result = await notificationService.desabonner(req.params.jeton);
  return ok(res, { resilie: result.resilie }, result.message);
});
