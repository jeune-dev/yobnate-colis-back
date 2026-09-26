const { Faq } = require('../../../models');
const { NotFoundError } = require('../../../errors/AppError');
const cache = require('../../../utils/cache');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/**
 * Questions fréquentes du site vitrine et de l'application (page « FAQ » du cahier
 * des charges), rédigées et ordonnées par l'administrateur.
 */
class FaqService {
  static CLE_CACHE = 'faq:publique';
  static TTL_CACHE = 5 * 60 * 1000;

  static ORDRE = [
    ['rubrique', 'ASC'],
    ['ordre', 'ASC'],
    ['createdAt', 'ASC'],
  ];

  static charger = async (id) => {
    const faq = await Faq.findByPk(id);
    if (!faq) throw new NotFoundError('Question introuvable');
    return faq;
  };

  /** FAQ publique : questions actives, regroupées par rubrique dans l'ordre choisi. */
  static publique = () =>
    cache.memoiser(FaqService.CLE_CACHE, FaqService.TTL_CACHE, async () => {
      const questions = await Faq.findAll({
        where: { isActive: true },
        attributes: ['id', 'question', 'reponse', 'rubrique', 'ordre'],
        order: FaqService.ORDRE,
      });
      const rubriques = Faq.RUBRIQUES.map((rubrique) => ({
        rubrique,
        questions: questions
          .filter((q) => q.rubrique === rubrique)
          .map(({ id, question, reponse }) => ({ id, question, reponse })),
      })).filter((r) => r.questions.length);
      return { message: 'Questions fréquentes', rubriques };
    });

  static lister = async (filters = {}) => {
    const where = {};
    if (filters.rubrique) where.rubrique = filters.rubrique;
    const questions = await Faq.findAll({ where, order: FaqService.ORDRE });
    return { message: 'Questions fréquentes', questions };
  };

  static creer = async (data, adminId) => {
    const faq = await Faq.create({ ...data, modifiePar: adminId });
    cache.del(FaqService.CLE_CACHE);
    await logActivity({
      userId: adminId,
      action: 'admin.faq.creer',
      entite: 'Faq',
      entiteId: faq.id,
    });
    return { message: 'Question ajoutée.', faq };
  };

  static modifier = async (id, data, adminId) => {
    const faq = await FaqService.charger(id);
    await faq.update({ ...data, modifiePar: adminId });
    cache.del(FaqService.CLE_CACHE);
    await logActivity({
      userId: adminId,
      action: 'admin.faq.modifier',
      entite: 'Faq',
      entiteId: id,
    });
    return { message: 'Question mise à jour.', faq };
  };

  static supprimer = async (id, adminId) => {
    const faq = await FaqService.charger(id);
    await faq.destroy();
    cache.del(FaqService.CLE_CACHE);
    await logActivity({
      userId: adminId,
      action: 'admin.faq.supprimer',
      entite: 'Faq',
      entiteId: id,
    });
    return { message: 'Question supprimée.' };
  };
}

module.exports = FaqService;
