const { UniqueConstraintError } = require('sequelize');
const { Facture, User } = require('../../../models');
const { BadRequestError } = require('../../../errors/AppError');
const { genererRefFacture } = require('../../../utils/referenceGenerator');
const { ajouterJoursCalendaires } = require('../../../utils/delais');
const { arrondir, formater } = require('../../../utils/devise');
const { envoyerModele, URL_PUBLIQUE } = require('../../../infrastructure/mailer');
const logger = require('../../../utils/logger');
const parametreService = require('../../parametre/service/parametre.service');
const notificationService = require('../../notification/service/notification.service');

/**
 * Émission des factures d'expédition.
 *
 * Le moment de la facturation dépend de la catégorie du colis :
 * - catégorie 1 : dès la commande (paiement après simulation) ;
 * - catégorie 2 : à la réception du colis par nos équipes ;
 * - catégorie 3 : à l'acceptation de la proposition tarifaire par le client.
 * Chaque facture émise est envoyée avec un lien de paiement.
 */
class FacturationService {
  /** Lien de paiement : URL bancaire paramétrée, ou page de paiement de l'application. */
  static lienPaiement = (facture, parametres = {}) => {
    const modele = parametres.url_paiement_banque;
    if (modele) {
      return modele
        .replace(/\{\{\s*reference\s*\}\}/g, encodeURIComponent(facture.reference))
        .replace(/\{\{\s*montant\s*\}\}/g, encodeURIComponent(String(facture.montantTotal)))
        .replace(/\{\{\s*devise\s*\}\}/g, encodeURIComponent(facture.devise));
    }
    return URL_PUBLIQUE ? `${URL_PUBLIQUE}/paiement/${facture.reference}` : null;
  };

  /** Lignes lisibles de la facture, reprises du détail tarifaire figé sur le colis. */
  static construireLignes = (colis, montants) => {
    const detail = colis.detailTarification || {};
    const lignes = [];

    if (colis.lignesForfait?.length) {
      for (const l of colis.lignesForfait) {
        lignes.push({
          libelle: `${l.libelle}${l.quantite > 1 ? ` × ${l.quantite}` : ''} (forfait, livraison incluse)`,
          montant: l.montant,
        });
      }
    } else if (detail.proposition) {
      lignes.push({ libelle: 'Transport — tarif sur devis', montant: montants.fret });
    } else {
      lignes.push({
        libelle: `Transport ${colis.service?.nom || ''} — ${colis.poidsFactureKg} kg`.trim(),
        montant: montants.fret,
      });
    }
    // Une proposition sur devis est un prix global : les annexes y sont déjà incluses
    if (!detail.proposition) {
      for (const s of detail.surcharges || []) {
        lignes.push({ libelle: s.libelle, montant: s.montant });
      }
      for (const a of detail.annexes || []) lignes.push({ libelle: a.libelle, montant: a.montant });
    }
    if (Number(montants.assurance) > 0) {
      lignes.push({ libelle: 'Assurance ad valorem', montant: montants.assurance });
    }
    if (Number(montants.droitsDouane) > 0) {
      lignes.push({ libelle: "Droits et taxes à l'import (DDP)", montant: montants.droitsDouane });
    }
    if (Number(montants.creditParrainage) > 0) {
      lignes.push({ libelle: 'Crédit parrainage', montant: -Number(montants.creditParrainage) });
    }
    return lignes;
  };

  /**
   * Crée la facture d'un colis s'il n'en a pas encore.
   * Idempotent : un second appel renvoie la facture existante.
   */
  static emettreFactureColis = async (colis, { transaction = null, auteurId = null } = {}) => {
    const existante = await Facture.findOne({ where: { colisId: colis.id }, transaction });
    if (existante) return { facture: existante, creee: false };

    if (Number(colis.montantTotal) <= 0) {
      throw new BadRequestError("Le montant de l'expédition n'est pas encore arrêté");
    }

    const parametres = await parametreService.chargerTous();
    const montants = colis.detailTarification?.montants || {};
    const devise = colis.devise;
    const creditHt = Number(montants.creditParrainageHt || 0);

    const donnees = {
      colisId: colis.id,
      userId: colis.userId,
      type: 'expedition',
      payeur: colis.payeur,
      devise,
      montantFret: colis.montantFret,
      montantSurcharges: colis.montantSurcharges,
      montantAssurance: colis.montantAssurance,
      montantDroitsDouane: colis.montantDroitsDouane,
      montantHt:
        montants.totalHt ??
        arrondir(
          Number(colis.montantFret) +
            Number(colis.montantSurcharges) +
            Number(colis.montantAssurance),
          devise
        ),
      tauxTva: montants.tauxTva ?? 0,
      montantTva: colis.montantTva,
      remise: creditHt,
      motifRemise: creditHt > 0 ? 'Crédit parrainage' : null,
      montantTotal: colis.montantTotal,
      lignes: FacturationService.construireLignes(colis, {
        ...montants,
        fret: colis.montantFret,
        assurance: colis.montantAssurance,
        droitsDouane: colis.montantDroitsDouane,
      }),
      statut: 'en_attente',
      dateLimitePaiement: ajouterJoursCalendaires(
        new Date(),
        Number(parametres.delai_paiement_jours)
      )
        .toISOString()
        .slice(0, 10),
      mentions: parametres.mentions_facture,
      emisePar: auteurId,
    };

    for (let tentative = 0; tentative < 3; tentative += 1) {
      try {
        const reference = await genererRefFacture(transaction);
        const facture = await Facture.create({ ...donnees, reference }, { transaction });
        return { facture, creee: true };
      } catch (err) {
        if (err instanceof UniqueConstraintError && tentative < 2) continue;
        throw err;
      }
    }
    throw new BadRequestError('Impossible de générer une référence de facture, veuillez réessayer');
  };

  /** Envoie la facture et son lien de paiement au client (email + notification). */
  static envoyerLienPaiement = async (colis, facture) => {
    try {
      const [parametres, client] = await Promise.all([
        parametreService.chargerTous(),
        User.findByPk(colis.userId, {
          attributes: ['id', 'email', 'prenom', 'notificationsEmail'],
        }),
      ]);
      const lien = FacturationService.lienPaiement(facture, parametres);
      const montant = formater(facture.montantTotal, facture.devise);

      await notificationService.notifier({
        userId: colis.userId,
        titre: `Facture ${facture.reference} — ${montant}`,
        message: `Votre colis ${colis.reference} est facturé ${montant}. Réglez-le en ligne depuis l'application.`,
        type: 'paiement',
        niveau: 'alerte',
        entite: 'Facture',
        entiteId: facture.id,
        lienCible: `/factures/${facture.id}`,
      });

      if (client?.email) {
        await envoyerModele('facture_lien_paiement', client.email, {
          prenom: client.prenom,
          reference: colis.reference,
          facture: facture.reference,
          montant,
          dateLimite: facture.dateLimitePaiement,
          lien,
        });
      }
      return lien;
    } catch (err) {
      logger.error('Lien de paiement non envoyé', { message: err.message, colisId: colis.id });
      return null;
    }
  };
}

module.exports = FacturationService;
