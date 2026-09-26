const { Op } = require('sequelize');
const { sequelize, Colis, User, PointCollecte, DemandeEnlevement } = require('../../../models');
const { arrondir, formater } = require('../../../utils/devise');
const { envoyerModele, URL_PUBLIQUE } = require('../../../infrastructure/mailer');
const { BadRequestError, NotFoundError } = require('../../../errors/AppError');
const { logActivity } = require('../../activityLog/service/activityLog.service');
const suiviService = require('./suivi.service');
const parametreService = require('../../parametre/service/parametre.service');

/**
 * Étude des demandes des catégories 2 et 3 par l'administrateur : validation
 * (prix « à partir de » éventuellement ajusté), refus, proposition tarifaire
 * d'un colis XXL. Chaque décision est prise sous verrou, dans une transaction,
 * et ne peut donc pas se croiser avec une action du client sur le même colis.
 */

class ColisEtudeService {
  /* ── Étude des demandes (catégories 2 et 3) ─────────────────────────────── */

  /**
   * Décompose un montant TTC arrêté par l'administrateur (prix ajusté ou
   * proposition tarifaire) en hors taxes et TVA, selon le pays de facturation.
   */
  static montantsDepuisTtc = (colis, montantTotal, parametres, { forfaitGlobal = false } = {}) => {
    const devise = colis.devise;
    const paysFacturation = colis.payeur === 'destinataire' ? colis.paysArrivee : colis.paysDepart;
    const tauxTva = Number(paysFacturation === 'FR' ? parametres.tva_fr : parametres.tva_sn);
    const droits = Number(colis.montantDroitsDouane || 0);
    const total = arrondir(montantTotal, devise);
    const ht = arrondir((total - droits) / (1 + tauxTva / 100), devise);
    const tva = arrondir(total - droits - ht, devise);
    const surcharges = forfaitGlobal ? 0 : Number(colis.montantSurcharges || 0);
    const assurance = forfaitGlobal ? 0 : Number(colis.montantAssurance || 0);
    const fret = arrondir(Math.max(0, ht - surcharges - assurance), devise);
    return {
      colonnes: {
        montantFret: fret,
        montantSurcharges: surcharges,
        montantAssurance: assurance,
        montantTva: tva,
        montantTotal: total,
      },
      montants: {
        fret,
        surcharges,
        assurance,
        totalHt: ht,
        tauxTva,
        tva,
        droitsDouane: droits,
        creditParrainage: 0,
        creditParrainageHt: 0,
        total,
      },
    };
  };

  /**
   * Charge une demande à l'étude sous verrou de ligne, dans la transaction
   * fournie : la décision de l'administrateur ne peut pas se croiser avec une
   * annulation ou une réponse du client sur le même colis.
   */
  static verrouillerDemandeAEtudier = async (
    id,
    transaction,
    statutsAutorises = ['en_attente_validation']
  ) => {
    const colis = await Colis.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!colis) throw new NotFoundError('Expédition introuvable');
    if (!statutsAutorises.includes(colis.statut)) {
      throw new BadRequestError(`Cette demande n'est pas à l'étude (statut : ${colis.statut})`);
    }
    return colis;
  };

  /** Client et point de dépôt, nécessaires aux messages envoyés après la décision. */
  static chargerPourMessage = (id) =>
    Colis.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'email', 'prenom', 'notificationsEmail'] },
        { model: PointCollecte, as: 'pointCollecteDepart', attributes: ['id', 'nom', 'adresse'] },
      ],
    });

  /** Date prévue d'enlèvement renseignée par l'administrateur avant la tournée. */
  static fixerDatePrevueEnlevement = async (colis, date, transaction = null) => {
    if (!date) return;
    await colis.update(
      { infosCollecte: { ...(colis.infosCollecte || {}), datePrevue: date } },
      { transaction }
    );
    await DemandeEnlevement.update(
      { dateSouhaitee: date },
      { where: { colisId: colis.id, statut: { [Op.in]: ['demande', 'planifie'] } }, transaction }
    );
  };

  /**
   * Valide une demande de catégorie 2. Un prix « à partir de » peut être ajusté à
   * cette occasion ; la facture sera émise à la réception du colis.
   */
  static validerDemande = async (
    id,
    { montantTotal, commentaire, datePrevueEnlevement },
    adminId
  ) => {
    const parametres = await parametreService.chargerTous();
    // Prix ajusté, date de collecte et changement de statut : tout ou rien
    await sequelize.transaction(async (t) => {
      const verrouille = await ColisEtudeService.verrouillerDemandeAEtudier(id, t);
      if (verrouille.categorie === 'colis_xxl') {
        throw new BadRequestError('Un colis XXL se valide par une proposition tarifaire');
      }

      const maj = { valideAt: new Date(), validePar: adminId };
      if (montantTotal) {
        const { colonnes, montants } = ColisEtudeService.montantsDepuisTtc(
          verrouille,
          montantTotal,
          parametres
        );
        Object.assign(maj, colonnes, {
          detailTarification: {
            ...verrouille.detailTarification,
            montants,
            ajustement: {
              ancienMontant: Number(verrouille.montantTotal),
              nouveauMontant: montants.total,
              par: adminId,
              le: new Date().toISOString(),
            },
          },
        });
      }
      await verrouille.update(maj, { transaction: t });
      await ColisEtudeService.fixerDatePrevueEnlevement(verrouille, datePrevueEnlevement, t);
      await suiviService.enregistrerEvenement(
        verrouille,
        { codeEvenement: 'VALIDE', commentaire: commentaire || null },
        { auteurId: adminId, transaction: t }
      );
    });
    const colis = await ColisEtudeService.chargerPourMessage(id);

    const consigne = ColisEtudeService.consigneRemise(colis, parametres, datePrevueEnlevement);
    if (colis.client?.email) {
      await envoyerModele('demande_validee', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        montant: formater(colis.montantTotal, colis.devise),
        instructions: [commentaire, consigne].filter(Boolean).join(' '),
        lien: URL_PUBLIQUE ? `${URL_PUBLIQUE}/suivi/${colis.reference}` : null,
      });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.colis.valider',
      entite: 'Colis',
      entiteId: colis.id,
      details: { montant: colis.montantTotal },
    });
    return { message: 'Demande validée, le client est prévenu.', colis };
  };

  /** Consigne de remise du colis communiquée au client après validation. */
  static consigneRemise = (colis, parametres, datePrevue = null) => {
    if (colis.modeDepot === 'enlevement_domicile') {
      const date = datePrevue || colis.infosCollecte?.datePrevue;
      return date
        ? `Collecte à domicile prévue le ${date}.`
        : 'Nous vous communiquerons la date de collecte.';
    }
    if (colis.modeDepot === 'point_collecte' && colis.pointCollecteDepart) {
      return `Déposez votre colis au point « ${colis.pointCollecteDepart.nom} » (${colis.pointCollecteDepart.adresse}).`;
    }
    const adresse =
      colis.paysDepart === 'SN' ? parametres.adresse_reception_sn : parametres.adresse_reception_fr;
    const ligne = [adresse?.nom, adresse?.adresse, adresse?.codePostal, adresse?.ville]
      .filter(Boolean)
      .join(', ');
    return ligne ? `Adresse de réception : ${ligne}.` : '';
  };

  /** Refus d'une demande à l'étude (ou retrait d'une proposition non acceptée). */
  static refuserDemande = async (id, { motif }, adminId) => {
    // Refus et restitution des ressources réservées : tout ou rien, et jamais deux fois
    await sequelize.transaction(async (t) => {
      const verrouille = await ColisEtudeService.verrouillerDemandeAEtudier(id, t, [
        'en_attente_validation',
        'devis_propose',
      ]);
      await verrouille.update({ motifRefus: motif, validePar: adminId }, { transaction: t });
      await require('./colisClient.service').liberRessources(verrouille, t);
      await suiviService.enregistrerEvenement(
        verrouille,
        { codeEvenement: 'DEMANDE_REFUSEE', commentaire: motif, motif },
        { auteurId: adminId, transaction: t }
      );
    });
    const colis = await ColisEtudeService.chargerPourMessage(id);

    if (colis.client?.email) {
      await envoyerModele('demande_refusee', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        motif,
      });
    }
    await logActivity({
      userId: adminId,
      action: 'admin.colis.refuser',
      entite: 'Colis',
      entiteId: colis.id,
      details: { motif },
    });
    return { message: 'Demande refusée, le client est prévenu.', colis };
  };

  /**
   * Proposition tarifaire d'un colis XXL, envoyée par email et notification avec
   * le tarif, les conditions et le lien pour l'accepter. Une nouvelle proposition
   * remplace la précédente tant que le client n'a pas répondu.
   */
  static proposerTarif = async (
    id,
    { montantTotal, commentaire, validiteJours, datePrevueEnlevement },
    adminId
  ) => {
    const parametres = await parametreService.chargerTous();
    const duree = Number(validiteJours || parametres.delai_validite_proposition_jours || 7);
    const expireAt = new Date(Date.now() + duree * 24 * 3600 * 1000);

    const montants = await sequelize.transaction(async (t) => {
      const verrouille = await ColisEtudeService.verrouillerDemandeAEtudier(id, t, [
        'en_attente_validation',
        'devis_propose',
      ]);
      const calcul = ColisEtudeService.montantsDepuisTtc(verrouille, montantTotal, parametres, {
        forfaitGlobal: true,
      });

      await verrouille.update(
        {
          ...calcul.colonnes,
          montantPropose: calcul.montants.total,
          propositionCommentaire: commentaire || null,
          propositionAt: new Date(),
          propositionExpireAt: expireAt,
          propositionRepondueAt: null,
          validePar: adminId,
          valideAt: new Date(),
          detailTarification: {
            ...verrouille.detailTarification,
            modeTarification: 'sur_devis',
            montants: calcul.montants,
            proposition: {
              montant: calcul.montants.total,
              commentaire,
              par: adminId,
              le: new Date(),
            },
          },
        },
        { transaction: t }
      );
      await ColisEtudeService.fixerDatePrevueEnlevement(verrouille, datePrevueEnlevement, t);
      await suiviService.enregistrerEvenement(
        verrouille,
        {
          codeEvenement: 'DEVIS_PROPOSE',
          commentaire: `Proposition : ${formater(calcul.montants.total, verrouille.devise)}`,
        },
        { auteurId: adminId, transaction: t }
      );
      return calcul.montants;
    });
    const colis = await ColisEtudeService.chargerPourMessage(id);

    if (colis.client?.email) {
      await envoyerModele('proposition_tarifaire', colis.client.email, {
        prenom: colis.client.prenom,
        reference: colis.reference,
        montant: formater(montants.total, colis.devise),
        commentaire: commentaire || '',
        conditions: [
          ColisEtudeService.consigneRemise(colis, parametres, datePrevueEnlevement),
          parametres.lien_cgv ? `Conditions générales : ${parametres.lien_cgv}` : '',
        ]
          .filter(Boolean)
          .join(' '),
        dateExpiration: expireAt.toISOString().slice(0, 10),
        lien: URL_PUBLIQUE ? `${URL_PUBLIQUE}/colis/${colis.id}` : null,
      });
    }

    await logActivity({
      userId: adminId,
      action: 'admin.colis.proposition',
      entite: 'Colis',
      entiteId: colis.id,
      details: { montant: montants.total, validiteJours: duree },
    });
    return { message: 'Proposition tarifaire envoyée au client.', colis };
  };
}

module.exports = ColisEtudeService;
