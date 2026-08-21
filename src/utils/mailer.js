const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const { formater } = require('./devise');

/**
 * Envoi des courriels transactionnels.
 *
 * Un échec d'envoi ne doit jamais faire échouer l'opération métier qui l'a
 * déclenché : les erreurs sont journalisées, pas propagées.
 */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

const URL_PUBLIQUE = process.env.APP_PUBLIC_URL || '';

const echapper = (valeur) =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Gabarit commun : en-tête, corps et pied de page. */
const gabarit = ({ titre, corps, bouton = null, piedDePage = '' }) => `
<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr><td style="background:#0b3d2c;padding:20px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:1px;">YOBNATE EXPRESS</span>
      <span style="color:#9fd5bd;font-size:12px;display:block;margin-top:4px;">France &nbsp;&#8646;&nbsp; Sénégal</span>
    </td></tr>
    <tr><td style="padding:24px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#0b3d2c;">${echapper(titre)}</h1>
      ${corps}
      ${bouton ? `<p style="margin:24px 0 0;"><a href="${echapper(bouton.url)}" style="display:inline-block;background:#0b3d2c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">${echapper(bouton.libelle)}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f0f2f5;font-size:12px;color:#6b7280;">
      ${piedDePage || 'Ce message vous est adressé automatiquement, merci de ne pas y répondre.'}
    </td></tr>
  </table>
</body></html>`;

const sendMail = async ({ to, subject, html, texte = null }) => {
  if (!to) return;
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html,
      text: texte || undefined,
    });
  } catch (err) {
    logger.error(`Échec envoi email à ${to}`, { message: err.message, subject });
  }
};

/* ── Comptes ────────────────────────────────────────────────────────────── */

const sendOtpEmail = (user, code) =>
  sendMail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe',
    html: gabarit({
      titre: 'Réinitialisation de mot de passe',
      corps: `<p>Bonjour ${echapper(user.prenom)},</p>
        <p>Voici le code à saisir pour définir un nouveau mot de passe :</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0b3d2c;margin:16px 0;">${echapper(code)}</p>
        <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
    }),
  });

const sendBienvenueEmail = (user) =>
  sendMail({
    to: user.email,
    subject: 'Bienvenue chez Yobnate Express',
    html: gabarit({
      titre: `Bienvenue ${echapper(user.prenom)}`,
      corps: `<p>Votre compte est créé. Vous pouvez dès à présent estimer un tarif, déclarer une
        expédition entre la France et le Sénégal et suivre vos colis en temps réel.</p>`,
      bouton: URL_PUBLIQUE ? { url: URL_PUBLIQUE, libelle: 'Accéder à mon espace' } : null,
    }),
  });

/* ── Expéditions ────────────────────────────────────────────────────────── */

const sendColisCreeEmail = (destinataireEmail, colis, prenom = '') =>
  sendMail({
    to: destinataireEmail,
    subject: `Expédition ${colis.reference} enregistrée`,
    html: gabarit({
      titre: 'Votre expédition est enregistrée',
      corps: `<p>Bonjour ${echapper(prenom)},</p>
        <p>Votre expédition a bien été enregistrée sous le numéro de suivi :</p>
        <p style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#0b3d2c;">${echapper(colis.reference)}</p>
        <p>Conservez ce numéro : il permet de suivre l'acheminement à tout moment.</p>`,
      bouton: URL_PUBLIQUE
        ? { url: `${URL_PUBLIQUE}/suivi/${colis.reference}`, libelle: 'Suivre mon colis' }
        : null,
    }),
  });

const sendColisStatutEmail = (destinataire, colis, evenement = {}) => {
  const email = typeof destinataire === 'string' ? destinataire : destinataire?.email;
  const prenom = typeof destinataire === 'string' ? '' : destinataire?.prenom || '';
  return sendMail({
    to: email,
    subject: `Colis ${colis.reference} — ${evenement.libelle || colis.statut}`,
    html: gabarit({
      titre: evenement.libelle || 'Mise à jour de votre colis',
      corps: `<p>Bonjour ${echapper(prenom)},</p>
        <p>Nouvelle étape pour votre colis <strong>${echapper(colis.reference)}</strong> :</p>
        <table role="presentation" cellpadding="6" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
          <tr><td style="color:#6b7280;">Statut</td><td><strong>${echapper(evenement.libelle || colis.statut)}</strong></td></tr>
          ${evenement.lieu ? `<tr><td style="color:#6b7280;">Lieu</td><td>${echapper(evenement.lieu)}</td></tr>` : ''}
          ${evenement.commentaire ? `<tr><td style="color:#6b7280;">Précision</td><td>${echapper(evenement.commentaire)}</td></tr>` : ''}
          ${colis.dateLivraisonEstimee ? `<tr><td style="color:#6b7280;">Livraison estimée</td><td>${echapper(colis.dateLivraisonEstimee)}</td></tr>` : ''}
        </table>`,
      bouton: URL_PUBLIQUE
        ? { url: `${URL_PUBLIQUE}/suivi/${colis.reference}`, libelle: 'Voir le suivi détaillé' }
        : null,
    }),
  });
};

const sendColisDisponibleEmail = (email, colis, point, prenom = '') =>
  sendMail({
    to: email,
    subject: `Colis ${colis.reference} disponible au retrait`,
    html: gabarit({
      titre: 'Votre colis vous attend',
      corps: `<p>Bonjour ${echapper(prenom)},</p>
        <p>Le colis <strong>${echapper(colis.reference)}</strong> est disponible au point de retrait suivant :</p>
        <p style="margin:12px 0;padding:12px;background:#f0f7f4;border-left:4px solid #0b3d2c;">
          <strong>${echapper(point?.nom)}</strong><br>${echapper(point?.adresse)}<br>
          ${point?.telephone ? `Tél. ${echapper(point.telephone)}` : ''}
        </p>
        ${colis.codeRetrait ? `<p>Code de retrait à présenter : <strong style="font-size:20px;letter-spacing:4px;">${echapper(colis.codeRetrait)}</strong></p>` : ''}
        ${colis.dateLimiteRetrait ? `<p>À retirer avant le <strong>${echapper(colis.dateLimiteRetrait)}</strong>, muni d'une pièce d'identité.</p>` : ''}`,
    }),
  });

/* ── Facturation ────────────────────────────────────────────────────────── */

const sendFactureEmail = (user, facture) =>
  sendMail({
    to: user.email,
    subject: `Facture ${facture.reference}`,
    html: gabarit({
      titre: 'Votre facture est disponible',
      corps: `<p>Bonjour ${echapper(user.prenom)},</p>
        <p>La facture <strong>${echapper(facture.reference)}</strong> d'un montant de
        <strong>${echapper(formater(facture.montantTotal, facture.devise))}</strong> a été émise.</p>
        ${facture.dateLimitePaiement ? `<p>Règlement attendu avant le <strong>${echapper(facture.dateLimitePaiement)}</strong>.</p>` : ''}`,
    }),
  });

const sendPaiementConfirmeEmail = (user, paiement, facture) =>
  sendMail({
    to: user.email,
    subject: `Paiement reçu — Facture ${facture.reference}`,
    html: gabarit({
      titre: 'Paiement confirmé',
      corps: `<p>Bonjour ${echapper(user.prenom)},</p>
        <p>Nous avons bien reçu votre règlement de
        <strong>${echapper(formater(paiement.montant, paiement.devise || facture.devise))}</strong>
        pour la facture ${echapper(facture.reference)}.</p>
        ${
          Number(facture.montantTotal) - Number(facture.montantPaye) > 0
            ? `<p>Solde restant dû : <strong>${echapper(formater(Number(facture.montantTotal) - Number(facture.montantPaye), facture.devise))}</strong>.</p>`
            : '<p>Cette facture est intégralement soldée.</p>'
        }`,
    }),
  });

/* ── Exploitation ───────────────────────────────────────────────────────── */

const sendEnlevementPlanifieEmail = (user, demande) =>
  sendMail({
    to: user.email,
    subject: `Enlèvement ${demande.reference} planifié`,
    html: gabarit({
      titre: 'Votre enlèvement est planifié',
      corps: `<p>Bonjour ${echapper(user.prenom)},</p>
        <p>Un coursier passera le <strong>${echapper(demande.dateSouhaitee)}</strong>
        sur le créneau <strong>${echapper(demande.creneau)}</strong> à l'adresse indiquée.</p>
        <p>Merci de préparer vos colis fermés et étiquetés.</p>`,
    }),
  });

const sendReclamationEmail = (user, reclamation, titre, corpsTexte) =>
  sendMail({
    to: user.email,
    subject: `Réclamation ${reclamation.reference} — ${titre}`,
    html: gabarit({
      titre,
      corps: `<p>Bonjour ${echapper(user.prenom)},</p><p>${echapper(corpsTexte)}</p>
        <p>Référence du dossier : <strong>${echapper(reclamation.reference)}</strong></p>`,
    }),
  });

module.exports = {
  sendMail,
  gabarit,
  sendOtpEmail,
  sendBienvenueEmail,
  sendColisCreeEmail,
  sendColisStatutEmail,
  sendColisDisponibleEmail,
  sendFactureEmail,
  sendPaiementConfirmeEmail,
  sendEnlevementPlanifieEmail,
  sendReclamationEmail,
};
