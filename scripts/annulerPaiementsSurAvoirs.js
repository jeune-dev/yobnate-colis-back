/* eslint-disable no-console -- script en ligne de commande : la sortie standard est son interface */
/**
 * Annule les « encaissements » enregistrés sur des avoirs avant le correctif du
 * 13/10/2026 (un avoir est une somme due AU client, pas un règlement de sa part).
 * Ils gonflaient l'encaissé de la page Paiements et de la caisse des points.
 *
 * Chaque paiement concerné passe « échoué » avec un motif explicite, et l'avoir
 * retrouve un montant réglé nul. Rien n'est supprimé : la piste reste au journal.
 *
 * Usage :
 *   node scripts/annulerPaiementsSurAvoirs.js             # liste seulement (aucune écriture)
 *   node scripts/annulerPaiementsSurAvoirs.js --appliquer # applique la correction
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, Paiement, Facture } = require('../src/models');

const appliquer = process.argv.includes('--appliquer');
const MOTIF = 'Annulé : encaissement saisi sur un avoir (somme due au client, non un règlement)';

(async () => {
  try {
    await sequelize.authenticate();
    const paiements = await Paiement.findAll({
      where: { statut: { [Op.in]: ['succes', 'partiel'] } },
      include: [{ model: Facture, as: 'facture', where: { type: 'avoir' }, required: true }],
      order: [['createdAt', 'ASC']],
    });

    if (!paiements.length) {
      console.log('Aucun paiement enregistré sur un avoir : rien à corriger.');
      process.exit(0);
    }

    for (const p of paiements) {
      console.log(
        `${p.reference} · ${p.montant} ${p.devise} · ${p.methode} · avoir ${p.facture.reference}`
      );
    }
    if (!appliquer) {
      console.log(`\n${paiements.length} paiement(s) à annuler. Relancez avec --appliquer.`);
      process.exit(0);
    }

    await sequelize.transaction(async (t) => {
      for (const p of paiements) {
        await p.update({ statut: 'echoue', motifRemboursement: MOTIF }, { transaction: t });
        // Rattaché à une facture : imputé (payé) ; sinon toujours dû au client
        await p.facture.update(
          { montantPaye: 0, statut: p.facture.factureOrigineId ? 'payee' : 'en_attente' },
          { transaction: t }
        );
      }
    });
    console.log(`\n✔ ${paiements.length} paiement(s) annulé(s).`);
    process.exit(0);
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
})();
