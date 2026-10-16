const crypto = require('crypto');
const { Colis, User } = require('../../../models');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../../errors/AppError');
const { evenementsAutorises } = require('../../../config/colis');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const parametreService = require('../../parametre/service/parametre.service');
const suiviService = require('./suivi.service');

// Chargé à l'usage : le service des expéditions dépend lui-même de celui-ci
const colisAdmin = () => require('./colisAdmin.service');

/**
 * Remise confirmée par le destinataire dans son application.
 *
 * Quand le destinataire a un compte, l'agent (retrait en point) ou le coursier
 * (livraison) affiche un code à usage unique au moment de la remise. Le
 * destinataire le saisit sur son appareil : c'est la preuve qu'il a le colis en
 * main, et la remise est enregistrée à son nom. Le code de retrait communiqué à
 * l'avance ne peut pas servir à cela, puisque le destinataire le connaît déjà.
 */
class RemiseService {
  static DUREE_VALIDITE_MS = 10 * 60 * 1000;
  static ECHECS_MAX = 5;

  /** Événement de remise selon l'étape : retrait au point ou livraison à domicile. */
  static EVENEMENT_PAR_STATUT = { disponible_retrait: 'RETIRE', en_livraison: 'LIVRE' };

  /** Empreinte salée par le secret du serveur : six chiffres ne se devinent pas hors ligne. */
  static empreinte = (colisId, code) =>
    crypto
      .createHmac('sha256', process.env.JWT_SECRET || '')
      .update(`${colisId}:${code}`)
      .digest('hex');

  /** Le numéro du compte suffit-il pour être reconnu destinataire (même règle que « Colis reçus ») ? */
  static numeroReconnu = async (user) => {
    if (!user?.telephone) return false;
    const { verification_telephone_obligatoire: verificationExigee } =
      await parametreService.chargerTous();
    return !verificationExigee || Boolean(user.telephoneVerifie);
  };

  /** Le destinataire de ce colis a-t-il un compte capable de confirmer la remise ? */
  static destinataireACompte = async (colis) => {
    if (!colis.destinataireTelephone) return false;
    const user = await User.findOne({
      where: { telephone: colis.destinataireTelephone, isActive: true },
      attributes: ['id', 'telephone', 'telephoneVerifie'],
    });
    return RemiseService.numeroReconnu(user);
  };

  /** Code à afficher par l'agent ou le coursier, valable dix minutes. */
  static genererCode = async (colisId, auteur) => {
    const colis = await Colis.findByPk(colisId);
    if (!colis) throw new NotFoundError('Expédition introuvable');

    const codeEvenement = RemiseService.EVENEMENT_PAR_STATUT[colis.statut];
    if (!codeEvenement) {
      throw new BadRequestError(
        'La remise se confirme quand le colis est disponible au point ou en cours de livraison'
      );
    }
    const permis = evenementsAutorises(auteur.role);
    if (permis && !permis.includes(codeEvenement)) {
      throw new ForbiddenError('Cette remise ne relève pas de votre mission');
    }
    if (!(await RemiseService.destinataireACompte(colis))) {
      throw new BadRequestError(
        "Le destinataire n'a pas de compte Yobante Colis : saisissez son code de retrait"
      );
    }
    // Le colis ne part pas avant règlement : autant le savoir avant d'afficher le code
    await colisAdmin().verifierReglementAvantRemise(colis, { codeEvenement }, auteur);

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expireLe = new Date(Date.now() + RemiseService.DUREE_VALIDITE_MS);
    await colis.update({
      codeRemiseEmpreinte: RemiseService.empreinte(colis.id, code),
      codeRemiseEvenement: codeEvenement,
      codeRemisePar: auteur.id,
      codeRemiseExpireLe: expireLe,
      codeRemiseEchecs: 0,
    });
    await logActivity({
      userId: auteur.id,
      action: 'colis.remise.code',
      entite: 'Colis',
      entiteId: colis.id,
      details: { codeEvenement },
    });
    return {
      message: 'Montrez ce code au destinataire : il le saisit dans son application.',
      code,
      codeEvenement,
      expireLe,
    };
  };

  static effacer = {
    codeRemiseEmpreinte: null,
    codeRemiseEvenement: null,
    codeRemisePar: null,
    codeRemiseExpireLe: null,
    codeRemiseEchecs: 0,
  };

  /** Le destinataire saisit le code affiché : la remise est enregistrée. */
  static confirmer = async (userId, colisId, code) => {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'telephone', 'telephoneVerifie'],
    });
    if (!user) throw new NotFoundError('Utilisateur introuvable');
    const colis = await Colis.findOne({
      where: { id: colisId, destinataireTelephone: user.telephone },
    });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (!(await RemiseService.numeroReconnu(user))) {
      throw new ForbiddenError(
        'Vérifiez votre numéro de téléphone pour confirmer la réception de vos colis'
      );
    }
    if (
      !colis.codeRemiseEmpreinte ||
      !colis.codeRemiseExpireLe ||
      new Date(colis.codeRemiseExpireLe) < new Date()
    ) {
      throw new BadRequestError(
        "Aucun code de remise en cours : demandez à l'agent d'en afficher un nouveau"
      );
    }

    const attendu = Buffer.from(colis.codeRemiseEmpreinte, 'hex');
    const recu = Buffer.from(RemiseService.empreinte(colis.id, String(code).trim()), 'hex');
    if (attendu.length !== recu.length || !crypto.timingSafeEqual(attendu, recu)) {
      const echecs = Number(colis.codeRemiseEchecs || 0) + 1;
      // Trop d'essais : le code est annulé, l'agent doit en afficher un nouveau
      await colis.update(
        echecs >= RemiseService.ECHECS_MAX ? RemiseService.effacer : { codeRemiseEchecs: echecs }
      );
      throw new BadRequestError(
        echecs >= RemiseService.ECHECS_MAX
          ? "Trop d'essais : demandez à l'agent d'afficher un nouveau code"
          : 'Code incorrect'
      );
    }

    const codeEvenement = colis.codeRemiseEvenement;
    const agentId = colis.codeRemisePar;
    // Le colis a pu être remis autrement (code de retrait) ou changer d'étape depuis
    // l'affichage du code : celui-ci ne vaut plus rien
    if (RemiseService.EVENEMENT_PAR_STATUT[colis.statut] !== codeEvenement) {
      await colis.update(RemiseService.effacer);
      throw new BadRequestError("Ce colis n'est plus en attente de remise");
    }
    // Contrôles avant de consommer le code : un refus le laisse utilisable
    await colisAdmin().verifierReglementAvantRemise(colis, { codeEvenement }, null);

    // Consommation atomique : deux saisies simultanées ne remettent pas deux fois le colis
    const empreinte = colis.codeRemiseEmpreinte;
    const [consomme] = await Colis.update(RemiseService.effacer, {
      where: { id: colis.id, codeRemiseEmpreinte: empreinte },
    });
    if (!consomme) throw new BadRequestError('Ce code a déjà été utilisé');

    let result;
    try {
      result = await suiviService.enregistrerEvenement(
        colis,
        { codeEvenement, commentaire: 'Remise confirmée par le destinataire dans son application' },
        { auteurId: agentId }
      );
    } catch (err) {
      // Remise refusée au dernier moment : le code redevient utilisable, s'il n'a
      // pas été remplacé entre-temps
      await Colis.update(
        {
          codeRemiseEmpreinte: empreinte,
          codeRemiseEvenement: codeEvenement,
          codeRemisePar: agentId,
          codeRemiseExpireLe: colis.codeRemiseExpireLe,
        },
        { where: { id: colis.id, codeRemiseEmpreinte: null } }
      );
      throw err;
    }
    await logActivity({
      userId,
      action: 'colis.remise.confirmee',
      entite: 'Colis',
      entiteId: colis.id,
      details: { codeEvenement, agentId },
    });
    return {
      message: 'Réception confirmée. Merci ! Vous pouvez maintenant donner votre avis.',
      colis: { id: colis.id, reference: colis.reference, statut: result.colis.statut },
    };
  };
}

module.exports = RemiseService;
