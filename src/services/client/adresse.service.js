const { Op } = require('sequelize');
const { sequelize, Adresse, Ville, PointCollecte } = require('../../models');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');
const { paginate, paginateResult } = require('../../utils/paginate');

/**
 * Carnet d'adresses du client : expéditeurs et destinataires enregistrés,
 * réutilisables lors d'une nouvelle expédition.
 */

class AdresseService {
  static INCLUDE_DETAIL = [
    { model: Ville, as: 'ville', attributes: ['id', 'nom', 'pays'] },
    {
      model: PointCollecte,
      as: 'pointRetraitPrefere',
      attributes: ['id', 'code', 'nom', 'adresse'],
    },
  ];

  static LIMITE_ADRESSES = 100;

  static validerVille = async (villeId, pays) => {
    const ville = await Ville.findByPk(villeId);
    if (!ville) throw new BadRequestError('Ville introuvable');
    if (!ville.isActive)
      throw new BadRequestError(`La ville « ${ville.nom} » n'est plus desservie`);
    if (pays && ville.pays !== pays)
      throw new BadRequestError('La ville ne correspond pas au pays indiqué');
    return ville;
  };

  static validerPointRetrait = async (pointId, pays) => {
    if (!pointId) return null;
    const point = await PointCollecte.findByPk(pointId);
    if (!point) throw new BadRequestError('Point de retrait introuvable');
    if (point.pays !== pays)
      throw new BadRequestError('Le point de retrait doit se situer dans le même pays');
    if (!point.offreService('retrait'))
      throw new BadRequestError("Ce point n'assure pas le retrait de colis");
    return point;
  };

  static getMesAdresses = async (userId, filters = {}, pagination = {}) => {
    const where = { userId };
    if (filters.type) where[Op.or] = [{ type: filters.type }, { type: 'les_deux' }];
    if (filters.pays) where.pays = filters.pays;
    if (filters.search) {
      where[Op.or] = [
        { libelle: { [Op.iLike]: `%${filters.search}%` } },
        { nom: { [Op.iLike]: `%${filters.search}%` } },
      ];
    }

    const { limit, offset } = paginate(pagination);
    const { rows, count } = await Adresse.findAndCountAll({
      where,
      include: AdresseService.INCLUDE_DETAIL,
      order: [
        ['parDefaut', 'DESC'],
        ['libelle', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    return {
      message: "Votre carnet d'adresses",
      adresses: rows,
      pagination: paginateResult(count, pagination.page, pagination.limit),
    };
  };

  static getAdresseById = async (userId, id) => {
    const adresse = await Adresse.findOne({
      where: { id, userId },
      include: AdresseService.INCLUDE_DETAIL,
    });
    if (!adresse) throw new NotFoundError('Adresse introuvable');
    return { message: "Détail de l'adresse", adresse };
  };

  /** Une seule adresse par défaut et par type : la précédente est déclassée. */
  static appliquerParDefaut = async (userId, type, adresseId, transaction) => {
    await Adresse.update(
      { parDefaut: false },
      { where: { userId, type, id: { [Op.ne]: adresseId } }, transaction }
    );
  };

  static creerAdresse = async (userId, data) => {
    const total = await Adresse.count({ where: { userId } });
    if (total >= AdresseService.LIMITE_ADRESSES) {
      throw new BadRequestError(
        `Votre carnet est limité à ${AdresseService.LIMITE_ADRESSES} adresses`
      );
    }

    await AdresseService.validerVille(data.villeId, data.pays);
    await AdresseService.validerPointRetrait(data.pointRetraitPrefereId, data.pays);

    const adresse = await sequelize.transaction(async (t) => {
      const creee = await Adresse.create({ ...data, userId }, { transaction: t });
      if (data.parDefaut) await AdresseService.appliquerParDefaut(userId, creee.type, creee.id, t);
      return creee;
    });

    return { message: 'Adresse ajoutée à votre carnet.', adresse };
  };

  static modifierAdresse = async (userId, id, data) => {
    const adresse = await Adresse.findOne({ where: { id, userId } });
    if (!adresse) throw new NotFoundError('Adresse introuvable');

    const pays = data.pays || adresse.pays;
    if (data.villeId || data.pays)
      await AdresseService.validerVille(data.villeId || adresse.villeId, pays);
    if (data.pointRetraitPrefereId !== undefined)
      await AdresseService.validerPointRetrait(data.pointRetraitPrefereId, pays);

    await sequelize.transaction(async (t) => {
      await adresse.update(data, { transaction: t });
      if (data.parDefaut)
        await AdresseService.appliquerParDefaut(userId, adresse.type, adresse.id, t);
    });

    return { message: 'Adresse mise à jour.', adresse };
  };

  static supprimerAdresse = async (userId, id) => {
    const adresse = await Adresse.findOne({ where: { id, userId } });
    if (!adresse) throw new NotFoundError('Adresse introuvable');

    await adresse.destroy();
    return { message: 'Adresse retirée de votre carnet.' };
  };

  static definirParDefaut = async (userId, id) => {
    const adresse = await Adresse.findOne({ where: { id, userId } });
    if (!adresse) throw new NotFoundError('Adresse introuvable');

    await sequelize.transaction(async (t) => {
      await adresse.update({ parDefaut: true }, { transaction: t });
      await AdresseService.appliquerParDefaut(userId, adresse.type, adresse.id, t);
    });

    return { message: `« ${adresse.libelle} » est votre adresse par défaut.`, adresse };
  };
}

module.exports = AdresseService;
