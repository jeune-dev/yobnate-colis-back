const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined
});

const sendMail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
  } catch (err) {
    logger.error(`Échec envoi email à ${to}: ${err.message}`);
  }
};

const sendOtpEmail = (user, code) =>
  sendMail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe',
    html: `<p>Bonjour ${user.prenom},</p><p>Voici votre code de réinitialisation de mot de passe.</p><h2>${code}</h2><p>Ce code expire dans 10 minutes.</p>`
  });

const sendColisStatutEmail = (user, colis) =>
  sendMail({
    to: user.email,
    subject: `Colis ${colis.reference} - nouveau statut`,
    html: `<p>Bonjour ${user.prenom},</p><p>Votre colis <strong>${colis.reference}</strong> est maintenant : <strong>${colis.statut}</strong>.</p>`
  });

const sendPaiementConfirmeEmail = (user, paiement, facture) =>
  sendMail({
    to: user.email,
    subject: `Paiement confirmé - Facture ${facture.reference}`,
    html: `<p>Bonjour ${user.prenom},</p><p>Nous avons bien reçu votre paiement de <strong>${paiement.montant} FCFA</strong> pour la facture ${facture.reference}.</p>`
  });

module.exports = { sendMail, sendOtpEmail, sendColisStatutEmail, sendPaiementConfirmeEmail };
