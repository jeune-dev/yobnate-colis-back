const { Op } = require('sequelize');
const { Facture } = require('../../../models');
const { BadRequestError } = require('../../../errors/AppError');
const { arrondir } = require('../../../utils/devise');
const { genererRefAvoir } = require('../../../utils/referenceGenerator');

/**
 * Avoirs : émission et imputation sur la facture d'origine.
 *
 * Un avoir est une facture de type `avoir`, numérotée dans sa propre séquence (AVO).
 * Rattaché à une facture, il en réduit le reste dû (`montantAvoirs`) sans compter
 * comme un encaissement : il est alors « payé » (imputé). Il reste « en attente »
 * pour la part qui dépasse ce que le client devait encore : c'est une somme due au
 * client, à lui rembourser. Sans facture d'origine (indemnisation d'une réclamation
 * hors expédition facturée), l'avoir est entièrement dû au client.
 */

/** Factures dont le client doit encore quelque chose : jamais un avoir. */
const FACTURES_DUES = {
  statut: { [Op.in]: ['en_attente', 'partiellement_payee'] },
  type: { [Op.ne]: 'avoir' },
};

/** Expression SQL du reste dû, pour les sommes groupées. */
const SQL_SOLDE_DU = '"montantTotal" - "montantPaye" - "montantAvoirs"';

/**
 * Émet un avoir dans la transaction appelante et l'impute sur sa facture d'origine.
 * La facture d'origine est verrouillée : deux avoirs simultanés sont sérialisés et
 * leur cumul ne dépasse jamais son total.
 */
const emettre = async ({
  factureOrigineId = null,
  userId,
  devise,
  montant,
  libelle,
  mentions,
  emisePar = null,
  transaction,
}) => {
  const montantAvoir = arrondir(Number(montant), devise);
  if (!(montantAvoir > 0)) throw new BadRequestError("Le montant de l'avoir doit être positif");

  let origine = null;
  let imputable = 0;
  if (factureOrigineId) {
    origine = await Facture.findByPk(factureOrigineId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!origine) throw new BadRequestError("Facture d'origine introuvable");
    if (origine.type === 'avoir') throw new BadRequestError('Un avoir ne se compense pas');
    if (origine.devise !== devise) {
      throw new BadRequestError("L'avoir doit être dans la devise de la facture d'origine");
    }
    const compensable = arrondir(
      Number(origine.montantTotal) - Number(origine.montantAvoirs),
      devise
    );
    if (montantAvoir > compensable) {
      throw new BadRequestError(
        `L'avoir dépasse le montant encore compensable de la facture (${compensable} ${devise}, ` +
          `${Number(origine.montantAvoirs)} déjà accordés)`
      );
    }
    imputable = Math.max(0, origine.soldeDu);
  }

  // Entièrement absorbé par le reste dû : imputé. Sinon, l'excédent est dû au client.
  const impute = Boolean(origine) && montantAvoir <= imputable;
  const avoir = await Facture.create(
    {
      reference: await genererRefAvoir(transaction),
      userId,
      colisId: null,
      factureOrigineId: origine?.id || null,
      type: 'avoir',
      devise,
      montantHt: montantAvoir,
      montantTotal: montantAvoir,
      statut: impute ? 'payee' : 'en_attente',
      datePaiementComplet: impute ? new Date() : null,
      lignes: [{ libelle, montant: montantAvoir }],
      mentions,
      emisePar,
    },
    { transaction }
  );

  if (origine) {
    const cumul = arrondir(Number(origine.montantAvoirs) + montantAvoir, devise);
    const maj = { montantAvoirs: cumul };
    const reste = arrondir(
      Number(origine.montantTotal) - Number(origine.montantPaye) - cumul,
      devise
    );
    if (reste <= 0 && ['en_attente', 'partiellement_payee'].includes(origine.statut)) {
      maj.statut = 'payee';
      maj.datePaiementComplet = new Date();
    }
    await origine.update(maj, { transaction });
  }

  return { avoir, origine };
};

module.exports = { emettre, FACTURES_DUES, SQL_SOLDE_DU };
