const { Op } = require('sequelize');
const { sequelize, DeclarationDouane, ArticleDouane, Colis, Ville } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const suiviService = require('../suivi.service');
const notificationService = require('../notification.service');
const parametreService = require('../parametre.service');
const tarificationService = require('../tarification.service');
const documents = require('../../utils/documents');
const { uploadToCloudinary } = require('../../utils/uploadService');

/**
 * Formalités douanières du corridor France - Sénégal.
 *
 * Toute marchandise franchissant la frontière de l'Union européenne fait l'objet
 * d'une déclaration détaillée. Le service couvre la constitution du dossier, son
 * dépôt auprès des autorités, le suivi du dédouanement et la gestion des blocages.
 */

class DouaneService {
  static INCLUDE_DETAIL = [
    { model: ArticleDouane, as: 'articles', separate: true, order: [['ordre', 'ASC']] },
    {
      model: Colis,
      as: 'colis',
      attributes: [
        'id',
        'reference',
        'statut',
        'expediteurNom',
        'destinataireNom',
        'destinataireEmail',
        'nbPieces',
        'poidsReelKg',
        'paysDepart',
        'paysArrivee',
        'userId',
        'devise',
        'adresseDepart',
        'adresseLivraison',
        'codePostalArrivee',
        'expediteurTelephone',
        'destinataireTelephone',
        'typeContenu',
        'incoterm',
      ],
      include: [
        { model: Ville, as: 'villeDepart', attributes: ['id', 'nom'] },
        { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom'] },
      ],
    },
  ];

  static TRANSITIONS = {
    brouillon: ['soumise'],
    soumise: ['en_cours', 'bloquee', 'refusee'],
    en_cours: ['dedouanee', 'bloquee', 'refusee'],
    bloquee: ['en_cours', 'dedouanee', 'refusee'],
    dedouanee: [],
    refusee: [],
  };

  static chargerDeclaration = async (id) => {
    const declaration = await DeclarationDouane.findByPk(id, {
      include: DouaneService.INCLUDE_DETAIL,
    });
    if (!declaration) throw new NotFoundError('Déclaration douanière introuvable');
    return declaration;
  };

  /* ── Consultation ───────────────────────────────────────────────────────── */

  static getAllDeclarations = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.paysImport) where.paysImport = filters.paysImport;
    if (filters.motifExport) where.motifExport = filters.motifExport;
    if (filters.incoterm) where.incoterm = filters.incoterm;
    if (filters.aTraiter === 'true' || filters.aTraiter === true) {
      where.statut = { [Op.in]: ['soumise', 'en_cours', 'bloquee'] };
    }
    if (filters.numeroDeclaration)
      where.numeroDeclaration = { [Op.iLike]: `%${filters.numeroDeclaration}%` };

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await DeclarationDouane.findAndCountAll({
      where,
      include: DouaneService.INCLUDE_DETAIL,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Déclarations douanières',
      declarations: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getDeclarationById = async (id) => ({
    message: 'Détail de la déclaration douanière',
    declaration: await DouaneService.chargerDeclaration(id),
  });

  static getDeclarationParColis = async (colisId) => {
    const declaration = await DeclarationDouane.findOne({
      where: { colisId },
      include: DouaneService.INCLUDE_DETAIL,
    });
    if (!declaration) throw new NotFoundError('Aucune déclaration douanière pour cette expédition');
    return { message: "Déclaration douanière de l'expédition", declaration };
  };

  /* ── Constitution du dossier ────────────────────────────────────────────── */

  /**
   * Recalcule les droits et taxes estimés à partir des lignes d'articles.
   * Le total des articles fait foi : il remplace la valeur globale saisie à la commande.
   */
  static recalculerEstimation = async (declaration, transaction = null) => {
    const [articles, parametres] = await Promise.all([
      ArticleDouane.findAll({ where: { declarationId: declaration.id }, transaction }),
      parametreService.chargerTous(),
    ]);

    const valeurTotale = articles.reduce(
      (acc, a) => acc + Number(a.quantite) * Number(a.valeurUnitaire),
      0
    );
    const poidsNet = articles.reduce((acc, a) => acc + Number(a.poidsNetKg || 0), 0);

    const estimation = tarificationService.calculerDroitsDouane({
      international: true,
      typeContenu: declaration.motifExport,
      incoterm: declaration.incoterm,
      valeurDeclaree: valeurTotale || declaration.valeurTotale,
      deviseValeur: declaration.devise,
      articles: articles.map((a) => ({
        quantite: a.quantite,
        valeurUnitaire: a.valeurUnitaire,
        tauxDroits: a.tauxDroits,
      })),
      parametres,
      deviseCible: declaration.devise,
      tauxChange: Number(parametres.taux_change_eur_xof),
    });

    await declaration.update(
      {
        valeurTotale: valeurTotale || declaration.valeurTotale,
        poidsNetKg: poidsNet || declaration.poidsNetKg,
        droitsEstimes: estimation.droits,
        taxesEstimees: estimation.taxes,
      },
      { transaction }
    );

    return estimation;
  };

  static updateDeclaration = async (id, data, adminId) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    if (['dedouanee', 'refusee'].includes(declaration.statut)) {
      throw new BadRequestError('Une déclaration clôturée ne peut plus être modifiée');
    }

    await declaration.update(data);
    await DouaneService.recalculerEstimation(declaration);
    await logActivity({
      userId: adminId,
      action: 'admin.douane.update',
      entite: 'DeclarationDouane',
      entiteId: id,
    });

    return {
      message: 'Déclaration mise à jour.',
      declaration: await DouaneService.chargerDeclaration(id),
    };
  };

  /** Remplace l'ensemble des lignes d'articles de la déclaration. */
  static definirArticles = async (id, articles, adminId) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    if (['dedouanee', 'refusee'].includes(declaration.statut)) {
      throw new BadRequestError('Une déclaration clôturée ne peut plus être modifiée');
    }

    await sequelize.transaction(async (t) => {
      await ArticleDouane.destroy({ where: { declarationId: id }, transaction: t });
      await ArticleDouane.bulkCreate(
        articles.map((a, i) => ({ ...a, declarationId: id, ordre: i + 1 })),
        { transaction: t, validate: true }
      );
    });

    const estimation = await DouaneService.recalculerEstimation(declaration);
    await logActivity({
      userId: adminId,
      action: 'admin.douane.articles',
      entite: 'DeclarationDouane',
      entiteId: id,
      details: { nbArticles: articles.length },
    });

    return {
      message: `${articles.length} article(s) enregistré(s).`,
      declaration: await DouaneService.chargerDeclaration(id),
      estimation,
    };
  };

  static ajouterArticle = async (id, article, adminId) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    if (['dedouanee', 'refusee'].includes(declaration.statut)) {
      throw new BadRequestError('Une déclaration clôturée ne peut plus être modifiée');
    }

    const dernier = await ArticleDouane.findOne({
      where: { declarationId: id },
      order: [['ordre', 'DESC']],
    });
    const cree = await ArticleDouane.create({
      ...article,
      declarationId: id,
      ordre: (dernier?.ordre || 0) + 1,
    });
    await DouaneService.recalculerEstimation(declaration);

    await logActivity({
      userId: adminId,
      action: 'admin.douane.article_ajout',
      entite: 'DeclarationDouane',
      entiteId: id,
    });
    return { message: 'Article ajouté à la déclaration.', article: cree };
  };

  static supprimerArticle = async (id, articleId, adminId) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    const article = await ArticleDouane.findOne({ where: { id: articleId, declarationId: id } });
    if (!article) throw new NotFoundError('Article introuvable');

    await article.destroy();
    await DouaneService.recalculerEstimation(declaration);
    await logActivity({
      userId: adminId,
      action: 'admin.douane.article_suppr',
      entite: 'DeclarationDouane',
      entiteId: id,
    });
    return { message: 'Article retiré de la déclaration.' };
  };

  /** Téléverse un justificatif : certificat d'origine, licence, autorisation. */
  static ajouterDocument = async (id, file, { type, libelle }, adminId) => {
    if (!file) throw new BadRequestError('Aucun document fourni');
    const declaration = await DouaneService.chargerDeclaration(id);

    const televerse = await uploadToCloudinary(file.buffer, {
      folder: 'yobnate-express/douane',
      resourceType: 'auto',
    });

    const document = {
      type: type || 'justificatif',
      libelle: libelle || file.originalname,
      url: televerse.url,
      publicId: televerse.publicId,
      ajouteLe: new Date().toISOString(),
    };
    await declaration.update({ documents: [...(declaration.documents || []), document] });

    await logActivity({
      userId: adminId,
      action: 'admin.douane.document',
      entite: 'DeclarationDouane',
      entiteId: id,
      details: { type: document.type },
    });
    return { message: 'Document justificatif ajouté.', document };
  };

  /* ── Cycle de dédouanement ──────────────────────────────────────────────── */

  /**
   * Fait progresser la déclaration et répercute l'état sur le suivi du colis.
   * Un blocage remonte immédiatement au client, dont l'action est souvent requise.
   */
  static changerStatut = async (
    id,
    { statut, numeroDeclaration, motifBlocage, droitsReels, taxesReelles },
    adminId
  ) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    if (!DouaneService.TRANSITIONS[declaration.statut]?.includes(statut)) {
      throw new BadRequestError(
        `Transition douanière invalide : ${declaration.statut} vers ${statut}`
      );
    }
    if (statut === 'bloquee' && !motifBlocage) {
      throw new BadRequestError('Le motif du blocage douanier est requis');
    }
    if (statut === 'soumise') {
      const nbArticles = await ArticleDouane.count({ where: { declarationId: id } });
      if (nbArticles === 0) {
        throw new BadRequestError(
          'Une déclaration doit comporter au moins un article pour être soumise'
        );
      }
    }

    const maj = { statut };
    if (numeroDeclaration) maj.numeroDeclaration = numeroDeclaration;
    if (statut === 'bloquee') maj.motifBlocage = motifBlocage;
    if (statut === 'soumise') maj.dateSoumission = new Date();
    if (statut === 'dedouanee') {
      maj.dateDedouanement = new Date();
      maj.motifBlocage = null;
      if (droitsReels !== undefined) maj.droitsReels = droitsReels;
      if (taxesReelles !== undefined) maj.taxesReelles = taxesReelles;
    }
    await declaration.update(maj);

    const EVENEMENTS = {
      soumise: { codeEvenement: 'DOUANE_EXP', commentaire: 'Dossier douanier déposé' },
      en_cours: { codeEvenement: 'DOUANE_IMP', commentaire: 'Dédouanement en cours' },
      bloquee: { codeEvenement: 'DOUANE_BLOC', commentaire: motifBlocage },
      dedouanee: { codeEvenement: 'DOUANE_OK', commentaire: 'Formalités douanières achevées' },
      refusee: {
        codeEvenement: 'RETOUR',
        commentaire: motifBlocage || "Marchandise refusée à l'import",
      },
    };

    const colis = await Colis.findByPk(declaration.colisId);
    if (colis && EVENEMENTS[statut]) {
      await suiviService
        .enregistrerEvenement(
          colis,
          {
            ...EVENEMENTS[statut],
            pays: statut === 'soumise' ? declaration.paysExport : declaration.paysImport,
          },
          { auteurId: adminId }
        )
        .catch(() => {});
    }

    if (statut === 'bloquee' && colis) {
      await notificationService.notifier({
        userId: colis.userId,
        titre: `Colis ${colis.reference} retenu en douane`,
        message: motifBlocage,
        type: 'douane',
        niveau: 'critique',
        entite: 'Colis',
        entiteId: colis.id,
        lienCible: `/colis/${colis.id}`,
      });
    }

    await logActivity({
      userId: adminId,
      action: `admin.douane.${statut}`,
      entite: 'DeclarationDouane',
      entiteId: id,
      details: { numeroDeclaration, motifBlocage },
    });

    return {
      message: `Déclaration ${statut}.`,
      declaration: await DouaneService.chargerDeclaration(id),
    };
  };

  /* ── Documents ──────────────────────────────────────────────────────────── */

  static getFactureCommerciale = async (id) => {
    const declaration = await DouaneService.chargerDeclaration(id);
    const parametres = await parametreService.chargerTous();
    const html = documents.genererFactureCommerciale(
      declaration.colis,
      declaration,
      declaration.articles || [],
      parametres
    );
    return {
      html,
      nomFichier: `facture-commerciale-${declaration.colis?.reference || declaration.id}.html`,
    };
  };

  /** Vue d'ensemble des dossiers douaniers en cours. */
  static getTableauDeBord = async () => {
    const parStatut = await DeclarationDouane.findAll({
      attributes: ['statut', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      group: ['statut'],
      raw: true,
    });

    const bloquees = await DeclarationDouane.findAll({
      where: { statut: 'bloquee' },
      include: [{ model: Colis, as: 'colis', attributes: ['id', 'reference', 'destinataireNom'] }],
      order: [['updatedAt', 'ASC']],
      limit: 20,
    });

    return {
      message: 'Tableau de bord douane',
      tableauDeBord: {
        parStatut: parStatut.map((r) => ({ statut: r.statut, total: Number(r.total) })),
        dossiersBloques: bloquees.map((d) => ({
          id: d.id,
          colis: d.colis?.reference,
          destinataire: d.colis?.destinataireNom,
          motif: d.motifBlocage,
          depuis: d.updatedAt,
        })),
      },
    };
  };
}

module.exports = DouaneService;
