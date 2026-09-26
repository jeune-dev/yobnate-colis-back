const { ModeleEmail } = require('../../../models');
const { NotFoundError } = require('../../../errors/AppError');
const {
  MODELES_PAR_DEFAUT,
  invaliderCacheModeles,
  remplacerVariables,
  gabarit,
} = require('../../../infrastructure/mailer');
const { logActivity } = require('../../activityLog/service/activityLog.service');

/**
 * Modèles d'emails du parcours d'expédition, personnalisables par l'administrateur.
 * Supprimer un modèle personnalisé rétablit le gabarit par défaut.
 */
class ModeleEmailService {
  static verifierCode = (code) => {
    if (!MODELES_PAR_DEFAUT[code]) throw new NotFoundError(`Modèle d'email inconnu : ${code}`);
    return MODELES_PAR_DEFAUT[code];
  };

  /** Tous les modèles connus, avec leur version personnalisée éventuelle. */
  static getAll = async () => {
    const personnalises = await ModeleEmail.findAll();
    const parCode = Object.fromEntries(personnalises.map((m) => [m.code, m]));
    return {
      message: "Modèles d'emails",
      modeles: Object.entries(MODELES_PAR_DEFAUT).map(([code, defaut]) => {
        const perso = parCode[code];
        return {
          code,
          description: defaut.description,
          variables: defaut.variables,
          personnalise: Boolean(perso),
          isActive: perso ? perso.isActive : true,
          sujet: perso?.sujet || defaut.sujet,
          corpsHtml: perso?.corpsHtml || defaut.corps,
          sujetParDefaut: defaut.sujet,
          corpsParDefaut: defaut.corps,
          modifieLe: perso?.updatedAt || null,
        };
      }),
    };
  };

  static enregistrer = async (code, { sujet, corpsHtml, isActive = true }, adminId) => {
    const defaut = ModeleEmailService.verifierCode(code);
    const [modele, cree] = await ModeleEmail.findOrCreate({
      where: { code },
      defaults: {
        code,
        sujet,
        corpsHtml,
        isActive,
        description: defaut.description,
        modifiePar: adminId,
      },
    });
    if (!cree) await modele.update({ sujet, corpsHtml, isActive, modifiePar: adminId });
    invaliderCacheModeles();
    await logActivity({
      userId: adminId,
      action: 'admin.modele_email.update',
      entite: 'ModeleEmail',
      entiteId: modele.id,
      details: { code },
    });
    return { message: 'Modèle enregistré.', modele };
  };

  static reinitialiser = async (code, adminId) => {
    ModeleEmailService.verifierCode(code);
    await ModeleEmail.destroy({ where: { code } });
    invaliderCacheModeles();
    await logActivity({
      userId: adminId,
      action: 'admin.modele_email.reset',
      entite: 'ModeleEmail',
      details: { code },
    });
    return { message: 'Modèle par défaut rétabli.' };
  };

  /** Aperçu HTML avec des valeurs d'exemple pour chaque variable. */
  static apercu = (code, { sujet, corpsHtml } = {}) => {
    const defaut = ModeleEmailService.verifierCode(code);
    const exemple = Object.fromEntries(defaut.variables.map((v) => [v, `[${v}]`]));
    const titre = remplacerVariables(sujet || defaut.sujet, exemple, false);
    return {
      sujet: titre,
      html: gabarit({
        titre,
        corps: remplacerVariables(corpsHtml || defaut.corps, exemple),
        bouton: defaut.bouton ? { url: '#', libelle: defaut.bouton.libelle } : null,
      }),
    };
  };
}

module.exports = ModeleEmailService;
