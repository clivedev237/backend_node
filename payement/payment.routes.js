/**
 * payement/payment.routes.js
 * Routes destinées à un usage web direct (page de paiement humaine) et à la
 * recherche de client. Distinct de payment.integration.routes.js, qui sert
 * exclusivement les appels inter-services depuis Spring Boot Reservation.
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./payment.controller');

// Recherche d'un client par nom (utile pour un futur back-office).
router.get('/api/clients/search', controller.searchClient);

// Création d'un lien de paiement (envoi mail/sms).
router.post('/api/payments/create-link', controller.createLink);

// Page HTML consultée par le client pour payer (lien reçu par mail/sms).
router.get('/pay/:token', controller.getDetails);

// Même contenu, exposé en JSON pur si un frontend veut l'afficher lui-même.
router.get('/api/payments/details/:token', controller.getDetails);

// Soumission du formulaire de paiement (mobile money).
router.post('/api/payments/process', controller.processPayment);

// Webhook appelé par Soleaspay pour notifier le résultat final.
router.post('/api/payments/webhook', controller.webhook);

module.exports = router;
