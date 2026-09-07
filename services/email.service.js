/**
 * services/email.service.js
 *
 * Version STUB : affiche l'e-mail dans la console au lieu de l'envoyer
 * réellement. Suffisant pour développer et tester le flux de paiement sans
 * dépendre d'un fournisseur SMTP.
 *
 * Pour brancher un vrai envoi plus tard (ex. nodemailer + SendGrid/Mailgun),
 * remplacez uniquement le corps de sendPaymentLinkEmail ci-dessous — sa
 * signature est déjà utilisée par payement/payment.controller.js.
 */

'use strict';

async function sendPaymentLinkEmail(toEmail, clientName, paymentUrl, amount, devise, description) {
  console.log(
    `\n📧 [EMAIL - STUB, non envoyé réellement]\n` +
    `   À       : ${toEmail}\n` +
    `   Objet   : Paiement VORA - ${description || 'Course'}\n` +
    `   Corps   : Bonjour ${clientName}, merci de régler ${amount} ${devise} via ce lien : ${paymentUrl}\n`,
  );
  return { accepted: [toEmail], stub: true };
}

module.exports = { sendPaymentLinkEmail };
