const { Op } = require('sequelize');
const { JourFerie } = require('../../models');
const { NotFoundError, ConflictError } = require('../../errors/AppError');
const { logActivity } = require('../activityLog.service');
const { PAYS } = require('../../constants/pays');

/**
 * Calendrier des jours non ouvrés, par pays.
 * Il alimente le calcul des délais d'acheminement et la planification des
 * enlèvements : un jour férié ne compte jamais comme jour ouvré.
 */

class JourFerieService {
  static getAllJoursFeries = async (filters = {}) => {
    const where = {};
    if (filters.pays) where.pays = filters.pays;
    if (filters.annee) {
      where[Op.or] = [
        { recurrent: true },
        { date: { [Op.between]: [`${filters.annee}-01-01`, `${filters.annee}-12-31`] } },
      ];
    }
    if (filters.recurrent !== undefined) {
      where.recurrent = filters.recurrent === 'true' || filters.recurrent === true;
    }

    const jours = await JourFerie.findAll({ where, order: [['date', 'ASC']] });
    return { message: 'Calendrier des jours fériés', joursFeries: jours };
  };

  static createJourFerie = async (data, adminId) => {
    const existant = await JourFerie.findOne({ where: { date: data.date, pays: data.pays } });
    if (existant) {
      throw new ConflictError(
        `Un jour férié est déjà déclaré le ${data.date} pour ${PAYS[data.pays]?.libelle}`
      );
    }

    const jour = await JourFerie.create(data);
    await logActivity({
      userId: adminId,
      action: 'admin.jour_ferie.create',
      entite: 'JourFerie',
      entiteId: jour.id,
    });
    return { message: 'Jour férié ajouté.', jourFerie: jour };
  };

  static updateJourFerie = async (id, data, adminId) => {
    const jour = await JourFerie.findByPk(id);
    if (!jour) throw new NotFoundError('Jour férié introuvable');

    if ((data.date && data.date !== String(jour.date)) || (data.pays && data.pays !== jour.pays)) {
      const doublon = await JourFerie.findOne({
        where: { date: data.date || jour.date, pays: data.pays || jour.pays, id: { [Op.ne]: id } },
      });
      if (doublon)
        throw new ConflictError('Un jour férié est déjà déclaré à cette date pour ce pays');
    }

    await jour.update(data);
    await logActivity({
      userId: adminId,
      action: 'admin.jour_ferie.update',
      entite: 'JourFerie',
      entiteId: jour.id,
    });
    return { message: 'Jour férié mis à jour.', jourFerie: jour };
  };

  static deleteJourFerie = async (id, adminId) => {
    const jour = await JourFerie.findByPk(id);
    if (!jour) throw new NotFoundError('Jour férié introuvable');

    await jour.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.jour_ferie.delete',
      entite: 'JourFerie',
      entiteId: id,
    });
    return { message: 'Jour férié supprimé.' };
  };

  /** Import groupé, typiquement le calendrier officiel d'une année. */
  static importerCalendrier = async (jours, adminId) => {
    const crees = [];
    const ignores = [];

    for (const jour of jours) {
      const existant = await JourFerie.findOne({ where: { date: jour.date, pays: jour.pays } });
      if (existant) {
        ignores.push({ date: jour.date, pays: jour.pays, motif: 'Déjà déclaré' });
        continue;
      }
      crees.push(await JourFerie.create(jour));
    }

    await logActivity({
      userId: adminId,
      action: 'admin.jour_ferie.import',
      entite: 'JourFerie',
      details: { crees: crees.length, ignores: ignores.length },
    });

    return {
      message: `${crees.length} jour(s) férié(s) importé(s), ${ignores.length} ignoré(s).`,
      joursFeries: crees,
      ignores,
    };
  };
}

module.exports = JourFerieService;
