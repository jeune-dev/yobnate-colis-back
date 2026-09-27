const { Op } = require('sequelize');
const {
  sequelize,
  Colis,
  SuiviColis,
  PointCollecte,
  Ville,
  User,
  ServiceExpedition,
} = require('../../../models');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const logger = require('../../../utils/logger');
const {
  EVENEMENTS_SUIVI,
  transitionAutorisee,
  statutEstTerminal,
} = require('../../../config/colis');
const { PAYS } = require('../../../config/pays');
const { ajouterJoursCalendaires } = require('../../../utils/delais');
const { apresCommit } = require('../../../utils/transactions');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const notificationService = require('../../notification/service/notification.service');
const parametreService = require('../../parametre/service/parametre.service');
const facturationService = require('../../facture/service/facturation.service');
const {
  sendColisStatutEmail,
  sendColisDisponibleEmail,
} = require('../../../infrastructure/mailer');

/**
 * Moteur de traçabilité.
 *
 * Point d'entrée unique de tout changement d'état d'une expédition : il vérifie
 * la transition, met à jour l'expédition et les compteurs de stock des points,
 * inscrit l'événement au fil de suivi puis notifie le client et les abonnés.
 * Aucun autre service ne doit modifier `statut` directement.
 */

/** Événements qui, s'ils échouent en notification, ne doivent pas bloquer le flux. */

class SuiviService {
  static notifierSansBloquer = (promesse, contexte) =>
    Promise.resolve(promesse).catch((err) =>
      logger.error('Notification de suivi non délivrée', { message: err.message, ...contexte })
    );

  /**
   * Ajuste les compteurs de colis en stock lorsqu'une expédition change de point.
   * Les compteurs sont incrémentés en base (et non recalculés) pour rester exacts
   * sous concurrence.
   */
  static majStockPoints = async (ancienPointId, nouveauPointId, transaction) => {
    if (ancienPointId === nouveauPointId) return;

    if (ancienPointId) {
      await PointCollecte.decrement('colisEnStock', {
        by: 1,
        where: { id: ancienPointId, colisEnStock: { [Op.gt]: 0 } },
        transaction,
      });
    }
    if (nouveauPointId) {
      await PointCollecte.increment('colisEnStock', {
        by: 1,
        where: { id: nouveauPointId },
        transaction,
      });
    }
  };

  /** Champs de l'expédition dérivés de la nature de l'événement. */
  static jalonsTemporels = (colis, codeEvenement, statut, point) => {
    const maj = {};
    const maintenant = new Date();

    if (['ENL_OK', 'DEPOT', 'RECEPTION'].includes(codeEvenement) && !colis.datePriseEnCharge) {
      maj.datePriseEnCharge = maintenant;
    }
    if (codeEvenement === 'DISPO' && point) {
      maj.dateLimiteRetrait = ajouterJoursCalendaires(
        maintenant,
        Number(point.delaiGardeJours || 15)
      )
        .toISOString()
        .slice(0, 10);
    }
    if (['LIVRE', 'RETIRE'].includes(codeEvenement)) {
      maj.dateLivraisonEffective = maintenant;
    }
    if (codeEvenement === 'LIV_ECHEC') {
      maj.nbTentativesLivraison = Number(colis.nbTentativesLivraison || 0) + 1;
    }
    if (statut === 'annule') maj.statut = 'annule';

    return maj;
  };

  /** Champs relus sous verrou avant d'appliquer un événement (voir enregistrerEvenement). */
  static CHAMPS_VERROUILLES = [
    'statut',
    'pointActuelId',
    'datePriseEnCharge',
    'dateLimiteRetrait',
    'dateLivraisonEffective',
    'nbTentativesLivraison',
  ];

  /**
   * Un événement purement informatif ne change pas l'état : il échappe au contrôle de
   * transition ; tout autre passage doit être autorisé par la machine à états.
   */
  static verifierTransition = (statutActuel, nouveauStatut) => {
    if (nouveauStatut === statutActuel) return;
    if (statutEstTerminal(statutActuel)) {
      throw new BadRequestError(
        `L'expédition est déjà dans un état définitif (${statutActuel}) : aucune évolution n'est possible`
      );
    }
    if (!transitionAutorisee(statutActuel, nouveauStatut)) {
      throw new BadRequestError(
        `Transition de statut invalide : ${statutActuel} vers ${nouveauStatut}`
      );
    }
  };

  /**
   * Enregistre un événement de suivi et fait évoluer l'expédition en conséquence.
   *
   * @param {Colis}  colis                Instance chargée (avec `client` si possible).
   * @param {object} params
   * @param {string} params.codeEvenement Code normalisé de l'événement.
   * @param {string} [params.statut]      Statut forcé ; par défaut celui induit par le code.
   * @param {string} [params.lieu]        Localisation affichée au client.
   * @param {string} [params.pointCollecteId] Point où se trouve désormais le colis.
   * @param {boolean}[params.visiblePublic]   Faux pour une annotation interne.
   * @param {object} options
   * @param {string} [options.auteurId]   Utilisateur à l'origine de l'événement.
   * @param {object} [options.transaction] Transaction englobante, le cas échéant.
   * @param {boolean}[options.notifier]   Désactive la notification (imports en masse).
   */
  static enregistrerEvenement = async (colis, params, options = {}) => {
    const {
      codeEvenement,
      statut: statutForce = null,
      lieu = null,
      pays = null,
      pointCollecteId = undefined,
      colisPieceId = null,
      commentaire = null,
      libelle = null,
      dateEvenement = new Date(),
      visiblePublic = true,
      motif = null,
    } = params;

    const definition = EVENEMENTS_SUIVI[codeEvenement];
    if (!definition) throw new BadRequestError(`Code d'événement inconnu : ${codeEvenement}`);

    // Contrôle anticipé (sans transaction) pour refuser vite une transition invalide ;
    // il est refait sous verrou ci-dessous, sur l'état réel en base.
    SuiviService.verifierTransition(colis.statut, statutForce || definition.statut || colis.statut);

    const executer = async (transaction) => {
      // Verrou de ligne : deux événements simultanés sur le même colis (double scan,
      // lot concurrent, tâche automatique) sont sérialisés. Sans lui, les deux lisaient
      // le même statut, passaient le contrôle et appliquaient deux fois les mouvements
      // de stock des points.
      const enBase = await Colis.findByPk(colis.id, {
        attributes: SuiviService.CHAMPS_VERROUILLES,
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (!enBase) throw new NotFoundError('Expédition introuvable');
      for (const champ of SuiviService.CHAMPS_VERROUILLES) {
        colis.set(champ, enBase.get(champ));
        colis.changed(champ, false);
      }
      const nouveauStatut = statutForce || definition.statut || colis.statut;
      SuiviService.verifierTransition(colis.statut, nouveauStatut);

      const ancienPointId = colis.pointActuelId;
      const pointCible = pointCollecteId === undefined ? ancienPointId : pointCollecteId;

      const point = pointCible ? await PointCollecte.findByPk(pointCible, { transaction }) : null;

      const maj = {
        statut: nouveauStatut,
        ...(await SuiviService.jalonsTemporels(colis, codeEvenement, nouveauStatut, point)),
      };
      if (pointCollecteId !== undefined) maj.pointActuelId = pointCollecteId;
      if (codeEvenement === 'ANNULE') maj.annuleMotif = motif || commentaire || null;
      if (nouveauStatut === 'incident') maj.motifIncident = motif || commentaire || null;

      // Un colis livré, retiré ou retourné ne réside plus dans aucun point
      if (statutEstTerminal(nouveauStatut)) maj.pointActuelId = null;

      await colis.update(maj, { transaction });
      await SuiviService.majStockPoints(
        ancienPointId,
        maj.pointActuelId ?? ancienPointId,
        transaction
      );

      const evenement = await SuiviColis.create(
        {
          colisId: colis.id,
          colisPieceId,
          codeEvenement,
          statut: nouveauStatut,
          libelle: libelle || definition.libelle,
          lieu: lieu || point?.nom || null,
          pays: pays || point?.pays || null,
          pointCollecteId: point?.id || null,
          commentaire,
          dateEvenement,
          visiblePublic,
          createdBy: options.auteurId || null,
        },
        { transaction }
      );

      return { evenement, point, nouveauStatut };
    };

    const { evenement, point, nouveauStatut } = options.transaction
      ? await executer(options.transaction)
      : await sequelize.transaction(executer);

    // Dans une transaction englobante, facturation, journal et notifications attendent
    // son COMMIT : ils ne tiennent pas une seconde connexion pendant que la transaction
    // garde la sienne et ses verrous, et rien n'est annoncé si elle est annulée.
    const effets = () =>
      SuiviService.effetsEvenement(colis, evenement, point, nouveauStatut, {
        ...options,
        codeEvenement,
        visiblePublic,
      });
    if (options.transaction) {
      await apresCommit(options.transaction, effets, { colisId: colis.id, codeEvenement });
    } else {
      await effets();
    }

    return { message: `Suivi mis à jour : ${evenement.libelle}.`, evenement, colis };
  };

  /** Facturation à la réception, journal et notifications d'un événement enregistré. */
  static effetsEvenement = async (colis, evenement, point, nouveauStatut, options) => {
    const { codeEvenement, visiblePublic } = options;
    await SuiviService.notifierSansBloquer(
      SuiviService.facturerALaReception(colis, codeEvenement, options.auteurId || null),
      { colisId: colis.id, etape: 'facturation' }
    );

    await logActivity({
      userId: options.auteurId || null,
      action: `colis.suivi.${codeEvenement.toLowerCase()}`,
      entite: 'Colis',
      entiteId: colis.id,
      details: { codeEvenement, statut: nouveauStatut, lieu: evenement.lieu },
    });

    if (options.notifier !== false && visiblePublic) {
      const client =
        colis.client ||
        (colis.userId
          ? await User.findByPk(colis.userId, {
              attributes: ['id', 'email', 'prenom', 'notificationsEmail'],
            })
          : null);

      await SuiviService.notifierSansBloquer(
        notificationService.notifier({
          userId: colis.userId,
          titre: `Colis ${colis.reference} — ${evenement.libelle}`,
          message: evenement.lieu ? `${evenement.libelle} · ${evenement.lieu}` : evenement.libelle,
          type: 'colis',
          niveau: nouveauStatut === 'incident' ? 'critique' : 'info',
          entite: 'Colis',
          entiteId: colis.id,
          lienCible: `/colis/${colis.id}`,
          email:
            client?.notificationsEmail &&
            !SuiviService.EVENEMENTS_EMAIL_DEDIE.includes(codeEvenement)
              ? () =>
                  codeEvenement === 'DISPO'
                    ? sendColisDisponibleEmail(client.email, colis, point, client.prenom)
                    : sendColisStatutEmail(client, colis, evenement)
              : null,
        }),
        { colisId: colis.id }
      );

      await SuiviService.notifierSansBloquer(
        notificationService.diffuserEvenement(colis, evenement),
        { colisId: colis.id }
      );
      await SuiviService.notifierSansBloquer(
        parametreService
          .chargerTous()
          .then((parametres) =>
            notificationService.notifierWhatsappSuivi(colis, evenement, parametres)
          ),
        { colisId: colis.id, canal: 'whatsapp' }
      );
    }
  };

  /**
   * Catégorie 2 : la facture et le lien de paiement sont émis dès que le colis
   * est pris en charge par nos équipes (dépôt, collecte ou réception).
   */
  static facturerALaReception = async (colis, codeEvenement, auteurId) => {
    if (!['DEPOT', 'RECEPTION', 'ENL_OK'].includes(codeEvenement)) return;
    if (colis.regles?.paiement !== 'a_la_reception') return;
    if (Number(colis.montantTotal) <= 0) return;
    const { facture, creee } = await facturationService.emettreFactureColis(colis, { auteurId });
    if (creee) await facturationService.envoyerLienPaiement(colis, facture);
  };

  /**
   * Événements qui déclenchent déjà leur propre courriel (accusé de réception,
   * validation, proposition, refus, facture) : pas de second courriel de statut.
   */
  static EVENEMENTS_EMAIL_DEDIE = [
    'SOUMIS',
    'VALIDE',
    'DEVIS_PROPOSE',
    'DEVIS_ACCEPTE',
    'DEMANDE_REFUSEE',
  ];

  /** Enregistre plusieurs événements sur des colis distincts (scan par lot). */
  static enregistrerEvenementsEnLot = async (colisIds, params, options = {}) => {
    const resultats = { traites: [], erreurs: [] };
    // Un seul chargement pour tout le lot (au lieu d'une requête par colis) ; chaque
    // événement reste appliqué sous son propre verrou, dans sa propre transaction.
    const parId = new Map(
      (await Colis.findAll({ where: { id: colisIds } })).map((colis) => [colis.id, colis])
    );

    for (const colisId of colisIds) {
      try {
        const colis = parId.get(colisId);
        if (!colis) throw new NotFoundError(`Colis ${colisId} introuvable`);
        await SuiviService.enregistrerEvenement(colis, params, options);
        resultats.traites.push({ id: colis.id, reference: colis.reference });
      } catch (err) {
        resultats.erreurs.push({ id: colisId, message: err.message });
      }
    }

    return {
      message: `${resultats.traites.length} colis mis à jour, ${resultats.erreurs.length} en erreur.`,
      ...resultats,
    };
  };

  static INCLUDE_SUIVI_PUBLIC = [
    { model: Ville, as: 'villeDepart', attributes: ['id', 'nom', 'pays'] },
    { model: Ville, as: 'villeArrivee', attributes: ['id', 'nom', 'pays'] },
    {
      model: ServiceExpedition,
      as: 'service',
      attributes: ['id', 'code', 'nom', 'delaiMinJours', 'delaiMaxJours'],
    },
    {
      model: PointCollecte,
      as: 'pointRetrait',
      attributes: ['id', 'code', 'nom', 'adresse', 'telephone', 'horaires', 'pays'],
    },
  ];

  /**
   * Suivi public d'une expédition à partir de son numéro.
   *
   * Aucune authentification n'est requise : la réponse est donc volontairement
   * restreinte aux informations d'acheminement, sans montants, sans coordonnées
   * complètes et sans annotations internes.
   */
  static getSuiviPublic = async (reference) => {
    const colis = await Colis.findOne({
      where: { reference: String(reference).trim().toUpperCase() },
      include: [
        ...SuiviService.INCLUDE_SUIVI_PUBLIC,
        {
          model: SuiviColis,
          as: 'historique',
          where: { visiblePublic: true },
          required: false,
          attributes: [
            'codeEvenement',
            'statut',
            'libelle',
            'lieu',
            'pays',
            'commentaire',
            'dateEvenement',
          ],
        },
      ],
      order: [[{ model: SuiviColis, as: 'historique' }, 'dateEvenement', 'ASC']],
    });

    if (!colis) throw new NotFoundError('Aucune expédition ne correspond à ce numéro de suivi');

    const masquerNom = (nom) => {
      const parties = String(nom || '')
        .trim()
        .split(/\s+/);
      return parties.map((p, i) => (i === 0 ? p : `${p.charAt(0)}.`)).join(' ');
    };

    return {
      message: "Suivi de l'expédition",
      suivi: {
        reference: colis.reference,
        statut: colis.statut,
        categorie: colis.categorie,
        statutLibelle: colis.historique?.length
          ? colis.historique[colis.historique.length - 1].libelle
          : 'Expédition enregistrée',
        service: colis.service ? { code: colis.service.code, nom: colis.service.nom } : null,
        expediteur: masquerNom(colis.expediteurNom),
        destinataire: masquerNom(colis.destinataireNom),
        origine: colis.villeDepart
          ? { ville: colis.villeDepart.nom, pays: PAYS[colis.villeDepart.pays]?.libelle }
          : null,
        destination: colis.villeArrivee
          ? { ville: colis.villeArrivee.nom, pays: PAYS[colis.villeArrivee.pays]?.libelle }
          : null,
        nbPieces: colis.nbPieces,
        poidsKg: Number(colis.poidsFactureKg),
        dateLivraisonEstimee: colis.dateLivraisonEstimee,
        dateLivraisonEffective: colis.dateLivraisonEffective,
        dateLimiteRetrait: colis.dateLimiteRetrait,
        enRetard: colis.estEnRetard,
        pointRetrait: colis.pointRetrait
          ? {
              nom: colis.pointRetrait.nom,
              adresse: colis.pointRetrait.adresse,
              telephone: colis.pointRetrait.telephone,
              horaires: colis.pointRetrait.horaires,
            }
          : null,
        historique: (colis.historique || []).map((e) => ({
          code: e.codeEvenement,
          libelle: e.libelle,
          lieu: e.lieu,
          pays: e.pays ? PAYS[e.pays]?.libelle : null,
          commentaire: e.commentaire,
          date: e.dateEvenement,
        })),
      },
    };
  };

  /** Fil de suivi complet, réservé aux vues authentifiées. */
  static getHistorique = async (colisId, { inclureInternes = false } = {}) => {
    const where = { colisId };
    if (!inclureInternes) where.visiblePublic = true;

    const historique = await SuiviColis.findAll({
      where,
      include: [
        { model: User, as: 'auteur', attributes: ['id', 'nom', 'prenom', 'role'] },
        { model: PointCollecte, as: 'point', attributes: ['id', 'code', 'nom', 'pays'] },
      ],
      order: [
        ['dateEvenement', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });

    return { message: 'Historique de suivi', historique };
  };
}

module.exports = SuiviService;
