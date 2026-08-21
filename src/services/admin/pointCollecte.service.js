const { Op } = require('sequelize');
const { sequelize, PointCollecte, Ville, User, Colis } = require('../../models');
const { BadRequestError, NotFoundError, ConflictError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');
const { logActivity } = require('../activityLog.service');
const { uploadToCloudinary, deleteFromCloudinary } = require('../../utils/uploadService');
const { trierParProximite, boiteEnglobante } = require('../../utils/geo');
const { PAYS } = require('../../constants/pays');
const { JOURS_SEMAINE, SERVICES_POINT, LIBELLES_TYPES_POINT } = require('../../constants/reseau');

/**
 * Gestion du réseau de points de collecte.
 *
 * C'est le référentiel structurant du service : chaque pays desservi dispose de
 * ses propres points, déclarés et pilotés par l'administrateur. Un point est le
 * lieu où un expéditeur dépose son colis et où un destinataire vient le retirer.
 */

class PointCollecteService {
  static INCLUDE_DETAIL = [
    { model: Ville, as: 'ville', attributes: ['id', 'nom', 'pays', 'region'] },
    { model: User, as: 'responsable', attributes: ['id', 'nom', 'prenom', 'email', 'telephone'] },
    { model: PointCollecte, as: 'hubRattachement', attributes: ['id', 'code', 'nom', 'type'] },
  ];

  /** Contrôle de cohérence des horaires : créneaux valides et non chevauchants. */
  static validerHoraires = (horaires) => {
    if (!horaires || typeof horaires !== 'object') return;
    const enMinutes = (hhmm) => {
      const [h, m] = String(hhmm).split(':').map(Number);
      return h * 60 + m;
    };

    for (const [jour, creneaux] of Object.entries(horaires)) {
      if (!JOURS_SEMAINE.includes(jour)) {
        throw new BadRequestError(`Jour inconnu dans la grille d'horaires : ${jour}`);
      }
      if (!Array.isArray(creneaux)) {
        throw new BadRequestError(`Les horaires du ${jour} doivent être une liste de créneaux`);
      }

      const tries = [...creneaux].sort((a, b) => enMinutes(a.debut) - enMinutes(b.debut));
      let finPrecedente = -1;
      for (const creneau of tries) {
        const debut = enMinutes(creneau.debut);
        const fin = enMinutes(creneau.fin);
        if (Number.isNaN(debut) || Number.isNaN(fin)) {
          throw new BadRequestError(`Créneau invalide le ${jour} : format attendu HH:MM`);
        }
        if (fin <= debut) {
          throw new BadRequestError(
            `Créneau invalide le ${jour} : ${creneau.debut}-${creneau.fin}`
          );
        }
        if (debut < finPrecedente) {
          throw new BadRequestError(`Créneaux qui se chevauchent le ${jour}`);
        }
        finPrecedente = fin;
      }
    }
  };

  static validerServices = (services) => {
    if (!services) return;
    const inconnus = services.filter((s) => !SERVICES_POINT.includes(s));
    if (inconnus.length) {
      throw new BadRequestError(`Prestation inconnue : ${inconnus.join(', ')}`);
    }
  };

  /** La ville doit exister, être active et appartenir au pays déclaré sur le point. */
  static validerVille = async (villeId, pays) => {
    const ville = await Ville.findByPk(villeId);
    if (!ville) throw new BadRequestError('Ville introuvable');
    if (ville.pays !== pays) {
      throw new BadRequestError(
        `La ville « ${ville.nom} » appartient au pays ${PAYS[ville.pays]?.libelle}, ` +
          `incompatible avec le pays déclaré (${PAYS[pays]?.libelle})`
      );
    }
    return ville;
  };

  /** Un hub de rattachement doit être un point de type hub, actif et du même pays. */
  static validerHub = async (hubId, pays) => {
    if (!hubId) return null;
    const hub = await PointCollecte.findByPk(hubId);
    if (!hub) throw new BadRequestError('Hub de rattachement introuvable');
    if (!['hub', 'entrepot'].includes(hub.type)) {
      throw new BadRequestError('Le point de rattachement doit être un hub ou un entrepôt');
    }
    if (hub.pays !== pays) {
      throw new BadRequestError(
        'Le hub de rattachement doit se situer dans le même pays que le point'
      );
    }
    return hub;
  };

  /** Le responsable désigné doit être un agent de point actif. */
  static validerResponsable = async (responsableId) => {
    if (!responsableId) return null;
    const user = await User.findByPk(responsableId);
    if (!user) throw new BadRequestError('Responsable introuvable');
    if (!['agent_point', 'admin', 'super_admin'].includes(user.role)) {
      throw new BadRequestError(
        "Le responsable d'un point doit avoir le rôle agent de point ou administrateur"
      );
    }
    return user;
  };

  /* ── Lecture ────────────────────────────────────────────────────────────── */

  static getAllPoints = async (filters = {}, pagination = {}) => {
    const where = {};
    if (filters.pays) where.pays = filters.pays;
    if (filters.type) where.type = filters.type;
    if (filters.villeId) where.villeId = filters.villeId;
    if (filters.isActive !== undefined)
      where.isActive = filters.isActive === 'true' || filters.isActive === true;
    if (filters.visiblePublic !== undefined) {
      where.visiblePublic = filters.visiblePublic === 'true' || filters.visiblePublic === true;
    }
    if (filters.enMaintenance !== undefined) {
      where.enMaintenance = filters.enMaintenance === 'true' || filters.enMaintenance === true;
    }
    if (filters.search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${filters.search}%` } },
        { code: { [Op.iLike]: `%${filters.search}%` } },
        { adresse: { [Op.iLike]: `%${filters.search}%` } },
        { quartier: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }
    if (filters.service) {
      where.services = { [Op.contains]: [filters.service] };
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await PointCollecte.findAndCountAll({
      where,
      include: PointCollecteService.INCLUDE_DETAIL,
      order: [
        ['pays', 'ASC'],
        ['nom', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: 'Liste des points de collecte',
      points: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getPointById = async (id) => {
    const point = await PointCollecte.findByPk(id, {
      include: PointCollecteService.INCLUDE_DETAIL,
    });
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    return {
      message: 'Détail du point de collecte',
      point: {
        ...point.toJSON(),
        typeLibelle: LIBELLES_TYPES_POINT[point.type],
        ouvertMaintenant: point.estOuvertLe(),
        sature: point.estSature(),
      },
    };
  };

  /** Vue synthétique du réseau, pays par pays. */
  static getReseauParPays = async () => {
    const points = await PointCollecte.findAll({
      where: { isActive: true },
      include: [{ model: Ville, as: 'ville', attributes: ['id', 'nom'] }],
      order: [['nom', 'ASC']],
    });

    const reseau = Object.keys(PAYS).map((code) => {
      const duPays = points.filter((p) => p.pays === code);
      return {
        pays: code,
        libelle: PAYS[code].libelle,
        devise: PAYS[code].devise,
        total: duPays.length,
        parType: Object.fromEntries(
          Object.keys(LIBELLES_TYPES_POINT).map((type) => [
            type,
            duPays.filter((p) => p.type === type).length,
          ])
        ),
        colisEnStock: duPays.reduce((acc, p) => acc + Number(p.colisEnStock || 0), 0),
        points: duPays.map((p) => ({
          id: p.id,
          code: p.code,
          nom: p.nom,
          type: p.type,
          ville: p.ville?.nom,
          colisEnStock: p.colisEnStock,
          ouvertMaintenant: p.estOuvertLe(),
        })),
      };
    });

    return { message: 'Réseau des points de collecte par pays', reseau };
  };

  /* ── Écriture ───────────────────────────────────────────────────────────── */

  static createPoint = async (data, adminId) => {
    const existant = await PointCollecte.findOne({ where: { code: data.code } });
    if (existant)
      throw new ConflictError(`Le code « ${data.code} » est déjà attribué à un autre point`);

    await PointCollecteService.validerVille(data.villeId, data.pays);
    await PointCollecteService.validerHub(data.hubRattachementId, data.pays);
    await PointCollecteService.validerResponsable(data.responsableId);
    PointCollecteService.validerHoraires(data.horaires);
    PointCollecteService.validerServices(data.services);

    const point = await PointCollecte.create({ ...data, colisEnStock: 0 });

    // L'agent désigné responsable est rattaché au point qu'il pilote
    if (data.responsableId) {
      await User.update(
        { pointCollecteId: point.id },
        { where: { id: data.responsableId, role: 'agent_point' } }
      );
    }

    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.create',
      entite: 'PointCollecte',
      entiteId: point.id,
      details: { code: point.code, pays: point.pays, type: point.type },
    });

    return PointCollecteService.getPointById(point.id).then((r) => ({
      message: 'Point de collecte créé.',
      point: r.point,
    }));
  };

  static updatePoint = async (id, data, adminId) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    if (data.code && data.code !== point.code) {
      const existant = await PointCollecte.findOne({
        where: { code: data.code, id: { [Op.ne]: id } },
      });
      if (existant)
        throw new ConflictError(`Le code « ${data.code} » est déjà attribué à un autre point`);
    }

    const pays = data.pays || point.pays;
    if (data.villeId || data.pays)
      await PointCollecteService.validerVille(data.villeId || point.villeId, pays);
    if (data.hubRattachementId !== undefined) {
      if (data.hubRattachementId === id)
        throw new BadRequestError('Un point ne peut pas être son propre hub');
      await PointCollecteService.validerHub(data.hubRattachementId, pays);
    }
    if (data.responsableId !== undefined)
      await PointCollecteService.validerResponsable(data.responsableId);
    if (data.horaires) PointCollecteService.validerHoraires(data.horaires);
    if (data.services) PointCollecteService.validerServices(data.services);

    // Réduire la capacité sous le stock présent empêcherait toute réception cohérente
    if (data.capaciteMaxColis && Number(data.capaciteMaxColis) < Number(point.colisEnStock)) {
      throw new BadRequestError(
        `La capacité (${data.capaciteMaxColis}) est inférieure au stock actuel (${point.colisEnStock} colis)`
      );
    }

    const ancienResponsable = point.responsableId;
    await point.update(data);

    if (data.responsableId !== undefined && data.responsableId !== ancienResponsable) {
      if (ancienResponsable) {
        await User.update(
          { pointCollecteId: null },
          { where: { id: ancienResponsable, role: 'agent_point' } }
        );
      }
      if (data.responsableId) {
        await User.update(
          { pointCollecteId: point.id },
          { where: { id: data.responsableId, role: 'agent_point' } }
        );
      }
    }

    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.update',
      entite: 'PointCollecte',
      entiteId: point.id,
      details: { champs: Object.keys(data) },
    });

    return PointCollecteService.getPointById(point.id).then((r) => ({
      message: 'Point de collecte mis à jour.',
      point: r.point,
    }));
  };

  /**
   * Active ou désactive un point.
   * Un point qui détient encore des colis ne peut pas être désactivé : il faut
   * d'abord transférer son stock, sous peine de rendre ces colis introuvables.
   */
  static togglePoint = async (id, isActive, adminId) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    if (!isActive && Number(point.colisEnStock) > 0) {
      throw new BadRequestError(
        `Ce point détient encore ${point.colisEnStock} colis. Transférez son stock avant de le désactiver.`
      );
    }

    await point.update({ isActive });
    await logActivity({
      userId: adminId,
      action: isActive ? 'admin.point_collecte.activate' : 'admin.point_collecte.deactivate',
      entite: 'PointCollecte',
      entiteId: point.id,
    });

    return {
      message: isActive ? 'Point de collecte activé.' : 'Point de collecte désactivé.',
      point,
    };
  };

  /** Fermeture temporaire : le point reste au réseau mais n'accepte plus de flux. */
  static setMaintenance = async (id, { enMaintenance, motif }, adminId) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    await point.update({ enMaintenance, motifMaintenance: enMaintenance ? motif || null : null });
    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.maintenance',
      entite: 'PointCollecte',
      entiteId: point.id,
      details: { enMaintenance, motif },
    });

    return {
      message: enMaintenance ? 'Point placé en maintenance.' : 'Point remis en service.',
      point,
    };
  };

  /**
   * Supprime un point définitivement.
   * Refusé dès qu'un colis y est rattaché, l'historique de suivi devant rester lisible.
   */
  static deletePoint = async (id, adminId) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    const rattaches = await Colis.count({
      where: {
        [Op.or]: [{ pointCollecteDepartId: id }, { pointRetraitId: id }, { pointActuelId: id }],
      },
    });
    if (rattaches > 0) {
      throw new BadRequestError(
        `${rattaches} expédition(s) référencent ce point. Désactivez-le plutôt que de le supprimer.`
      );
    }

    await point.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.delete',
      entite: 'PointCollecte',
      entiteId: id,
      details: { code: point.code },
    });

    return { message: 'Point de collecte supprimé.' };
  };

  /**
   * Transfère l'ensemble des colis présents d'un point vers un autre.
   * Utilisé avant une fermeture ou lors d'une réorganisation du réseau.
   */
  static transfererStock = async (id, destinationId, adminId) => {
    if (id === destinationId)
      throw new BadRequestError('Les points source et destination doivent différer');

    const [source, destination] = await Promise.all([
      PointCollecte.findByPk(id),
      PointCollecte.findByPk(destinationId),
    ]);
    if (!source) throw new NotFoundError('Point source introuvable');
    if (!destination) throw new NotFoundError('Point de destination introuvable');
    if (!destination.isActive) throw new BadRequestError('Le point de destination est désactivé');
    if (source.pays !== destination.pays) {
      throw new BadRequestError(
        "Un transfert de stock ne peut s'effectuer qu'entre points d'un même pays"
      );
    }

    const transferes = await sequelize.transaction(async (t) => {
      const colis = await Colis.findAll({
        where: { pointActuelId: id },
        attributes: ['id'],
        transaction: t,
      });
      await Colis.update(
        { pointActuelId: destinationId },
        { where: { pointActuelId: id }, transaction: t }
      );
      await Colis.update(
        { pointRetraitId: destinationId },
        { where: { pointRetraitId: id }, transaction: t }
      );
      await source.update({ colisEnStock: 0 }, { transaction: t });
      await destination.increment('colisEnStock', { by: colis.length, transaction: t });
      return colis.length;
    });

    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.transfert_stock',
      entite: 'PointCollecte',
      entiteId: id,
      details: { destinationId, nbColis: transferes },
    });

    return {
      message: `${transferes} colis transféré(s) vers « ${destination.nom} ».`,
      nbColis: transferes,
    };
  };

  static updatePhoto = async (id, file, adminId) => {
    if (!file) throw new BadRequestError('Aucune image fournie');
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    const televerse = await uploadToCloudinary(file.buffer, { folder: 'yobnate-express/points' });
    if (point.photoPublicId) await deleteFromCloudinary(point.photoPublicId);

    await point.update({ photoUrl: televerse.url, photoPublicId: televerse.publicId });
    await logActivity({
      userId: adminId,
      action: 'admin.point_collecte.photo',
      entite: 'PointCollecte',
      entiteId: point.id,
    });

    return { message: 'Photo du point mise à jour.', point };
  };

  /* ── Exploitation ───────────────────────────────────────────────────────── */

  /** Colis physiquement présents dans un point, avec alerte sur les délais de garde dépassés. */
  static getStock = async (id, filters = {}, pagination = {}) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    const where = { pointActuelId: id };
    if (filters.statut) where.statut = filters.statut;
    if (filters.enSouffrance === 'true' || filters.enSouffrance === true) {
      where.dateLimiteRetrait = { [Op.lt]: new Date().toISOString().slice(0, 10) };
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Colis.findAndCountAll({
      where,
      attributes: [
        'id',
        'reference',
        'statut',
        'destinataireNom',
        'destinataireTelephone',
        'nbPieces',
        'poidsFactureKg',
        'dateLimiteRetrait',
        'createdAt',
      ],
      order: [
        ['dateLimiteRetrait', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      limit,
      offset,
    });

    const aujourdhui = new Date().toISOString().slice(0, 10);
    return {
      message: `Stock du point « ${point.nom} »`,
      point: {
        id: point.id,
        code: point.code,
        nom: point.nom,
        capaciteMaxColis: point.capaciteMaxColis,
      },
      colis: rows.map((c) => ({
        ...c.toJSON(),
        enSouffrance: Boolean(c.dateLimiteRetrait && String(c.dateLimiteRetrait) < aujourdhui),
      })),
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  /** Indicateurs d'activité d'un point sur une période. */
  static getStatistiques = async (id, { dateDebut, dateFin } = {}) => {
    const point = await PointCollecte.findByPk(id);
    if (!point) throw new NotFoundError('Point de collecte introuvable');

    const periode = {};
    if (dateDebut) periode[Op.gte] = new Date(dateDebut);
    if (dateFin) periode[Op.lte] = new Date(dateFin);
    const filtreDate = Object.getOwnPropertySymbols(periode).length ? { createdAt: periode } : {};

    const [deposes, aRetirer, enStock, retires] = await Promise.all([
      Colis.count({ where: { pointCollecteDepartId: id, ...filtreDate } }),
      Colis.count({ where: { pointRetraitId: id, ...filtreDate } }),
      Colis.count({ where: { pointActuelId: id } }),
      Colis.count({ where: { pointRetraitId: id, statut: 'recupere', ...filtreDate } }),
    ]);

    return {
      message: `Statistiques du point « ${point.nom} »`,
      statistiques: {
        point: { id: point.id, code: point.code, nom: point.nom, pays: point.pays },
        colisDeposes: deposes,
        colisAffectesAuRetrait: aRetirer,
        colisEnStock: enStock,
        colisRetires: retires,
        tauxOccupation: point.capaciteMaxColis
          ? Number(((enStock / point.capaciteMaxColis) * 100).toFixed(1))
          : null,
      },
    };
  };

  /* ── Recherche publique ─────────────────────────────────────────────────── */

  /**
   * Recherche des points ouverts au public, filtrable par pays, ville et prestation.
   * Lorsque des coordonnées sont fournies, les résultats sont triés par proximité,
   * avec un pré-filtrage SQL sur une boîte englobante pour éviter de charger le pays entier.
   */
  static rechercherPointsPublics = async (filters = {}) => {
    const where = { isActive: true, visiblePublic: true, enMaintenance: false };
    if (filters.pays) where.pays = filters.pays;
    if (filters.villeId) where.villeId = filters.villeId;
    if (filters.service) where.services = { [Op.contains]: [filters.service] };
    if (filters.codePostal) where.codePostal = filters.codePostal;
    if (filters.search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${filters.search}%` } },
        { adresse: { [Op.iLike]: `%${filters.search}%` } },
        { quartier: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }
    // Les hubs et entrepôts sont des nœuds internes, jamais proposés au client
    where.type =
      filters.type && !['hub', 'entrepot'].includes(filters.type)
        ? filters.type
        : { [Op.notIn]: ['hub', 'entrepot'] };

    const aGeo =
      filters.latitude !== undefined &&
      filters.longitude !== undefined &&
      filters.latitude !== null &&
      filters.longitude !== null;
    const rayonKm = filters.rayonKm ? Number(filters.rayonKm) : 50;

    if (aGeo) {
      const boite = boiteEnglobante(Number(filters.latitude), Number(filters.longitude), rayonKm);
      where.latitude = { [Op.between]: [boite.latMin, boite.latMax] };
      where.longitude = { [Op.between]: [boite.lonMin, boite.lonMax] };
    }

    const points = await PointCollecte.findAll({
      where,
      include: [{ model: Ville, as: 'ville', attributes: ['id', 'nom', 'pays'] }],
      order: [['nom', 'ASC']],
      limit: aGeo ? 500 : 200,
    });

    const projeter = (p) => ({
      id: p.id,
      code: p.code,
      nom: p.nom,
      type: p.type,
      typeLibelle: LIBELLES_TYPES_POINT[p.type],
      pays: p.pays,
      paysLibelle: PAYS[p.pays]?.libelle,
      ville: p.ville ? { id: p.ville.id, nom: p.ville.nom } : null,
      adresse: p.adresse,
      complementAdresse: p.complementAdresse,
      quartier: p.quartier,
      codePostal: p.codePostal,
      latitude: p.latitude,
      longitude: p.longitude,
      telephone: p.telephone,
      horaires: p.horaires,
      services: p.services,
      instructionsAcces: p.instructionsAcces,
      photoUrl: p.photoUrl,
      poidsMaxColisKg: p.poidsMaxColisKg,
      delaiGardeJours: p.delaiGardeJours,
      ouvertMaintenant: p.estOuvertLe(),
      complet: p.estSature(),
    });

    const resultats = aGeo
      ? trierParProximite(
          points.map(projeter),
          Number(filters.latitude),
          Number(filters.longitude),
          { rayonKm }
        )
      : points.map(projeter);

    return {
      message: `${resultats.length} point(s) de collecte trouvé(s)`,
      points: resultats,
      recherche: aGeo
        ? { latitude: Number(filters.latitude), longitude: Number(filters.longitude), rayonKm }
        : null,
    };
  };

  /** Point ouvert au public le plus proche de coordonnées données. */
  static trouverPointLePlusProche = async (
    latitude,
    longitude,
    { pays = null, service = 'retrait' } = {}
  ) => {
    const { points } = await PointCollecteService.rechercherPointsPublics({
      latitude,
      longitude,
      pays,
      service,
      rayonKm: 200,
    });
    if (!points.length) return null;
    return points[0];
  };
}

module.exports = PointCollecteService;
