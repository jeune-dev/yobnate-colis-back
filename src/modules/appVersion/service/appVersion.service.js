const { sequelize, AppVersion } = require('../../../models');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/** Compare deux versions « majeure.mineure.correctif ». */
const comparerVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
};

/**
 * Version de l'application mobile (repris de Sign) : l'application interroge
 * la configuration active de sa plateforme au démarrage et impose la mise à
 * jour sous la version minimale.
 */
class AppVersionService {
  static comparerVersions = comparerVersions;

  static verifierCoherence = ({ derniereVersion, versionMinimale }) => {
    if (
      derniereVersion &&
      versionMinimale &&
      comparerVersions(versionMinimale, derniereVersion) > 0
    ) {
      throw new BadRequestError('La version minimale ne peut pas dépasser la dernière version');
    }
  };

  /** Une seule configuration active par plateforme : activer l'une désactive les autres. */
  static desactiverAutres = (plateforme, idConserve, transaction) =>
    AppVersion.update(
      { isActive: false },
      { where: { plateforme, isActive: true }, transaction }
    ).then(() =>
      idConserve
        ? AppVersion.update({ isActive: true }, { where: { id: idConserve }, transaction })
        : null
    );

  static getActive = async (plateforme) => {
    const config = await AppVersion.findOne({
      where: { plateforme, isActive: true },
      order: [['updatedAt', 'DESC']],
    });
    return {
      message: config ? 'Version de l’application' : 'Aucune configuration de version',
      version: config
        ? {
            plateforme: config.plateforme,
            derniereVersion: config.derniereVersion,
            versionMinimale: config.versionMinimale,
            miseAJourForcee: config.miseAJourForcee,
            titre: config.titre,
            message: config.message,
            lienStore: config.lienStore,
          }
        : null,
    };
  };

  static lister = async () => ({
    message: 'Configurations de version',
    versions: await AppVersion.findAll({
      order: [
        ['plateforme', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    }),
  });

  static creer = async (data, adminId) => {
    AppVersionService.verifierCoherence(data);
    const version = await sequelize.transaction(async (t) => {
      const creee = await AppVersion.create(data, { transaction: t });
      if (creee.isActive) await AppVersionService.desactiverAutres(creee.plateforme, creee.id, t);
      return creee;
    });
    await logActivity({
      userId: adminId,
      action: 'admin.app_version.create',
      entite: 'AppVersion',
      entiteId: version.id,
      details: { plateforme: version.plateforme, derniereVersion: version.derniereVersion },
    });
    return { message: 'Configuration de version créée.', version };
  };

  static modifier = async (id, data, adminId) => {
    const version = await sequelize.transaction(async (t) => {
      const existante = await AppVersion.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!existante) throw new NotFoundError('Configuration de version introuvable');
      AppVersionService.verifierCoherence({
        derniereVersion: data.derniereVersion ?? existante.derniereVersion,
        versionMinimale: data.versionMinimale ?? existante.versionMinimale,
      });
      await existante.update(data, { transaction: t });
      if (existante.isActive) {
        await AppVersionService.desactiverAutres(existante.plateforme, existante.id, t);
      }
      return existante;
    });
    await logActivity({
      userId: adminId,
      action: 'admin.app_version.update',
      entite: 'AppVersion',
      entiteId: id,
      details: { champs: Object.keys(data) },
    });
    return { message: 'Configuration de version mise à jour.', version: await version.reload() };
  };

  static supprimer = async (id, adminId) => {
    const version = await AppVersion.findByPk(id);
    if (!version) throw new NotFoundError('Configuration de version introuvable');
    await version.destroy();
    await logActivity({
      userId: adminId,
      action: 'admin.app_version.delete',
      entite: 'AppVersion',
      entiteId: id,
    });
    return { message: 'Configuration de version supprimée.' };
  };
}

module.exports = AppVersionService;
