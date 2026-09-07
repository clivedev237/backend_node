/**
 * payment.integration.routes.js
 *
 * Routes destinées EXCLUSIVEMENT aux appels inter-services depuis Spring Boot
 * Reservation (cadrage §9.2). Ne pas confondre avec payment.routes.js, qui
 * gère les pages web /pay/:token pour un usage humain direct.
 *
 * À monter dans server.js / app.js :
 *   app.use('/', require('./payement/payment.integration.routes'));
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./payment.integration.controller');
const requireGatewayIdentity = require('../middleware/requireGatewayIdentity');

/**
 * @openapi
 * /api/v1/payments/initiate:
 *   post:
 *     summary: Initier un paiement pour une réservation
 *     description: >
 *       Appelé par Spring Boot Reservation après confirmation d'arrivée (cadrage §9.2).
 *       Pour ORANGE_MONEY/MTN_MOMO, déclenche immédiatement l'agrégateur Soleaspay.
 *       Pour ESPECES, crée seulement l'enregistrement local (statut "pending"
 *       jusqu'à confirmation via /cash/confirm).
 *     tags: [Intégration Reservation]
 *     security: [{ GatewayIdentity: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client_id, amount]
 *             properties:
 *               client_id: { type: integer, example: 1 }
 *               amount: { type: string, example: "1000" }
 *               currency: { type: string, default: XAF }
 *               language: { type: string, default: fr }
 *               payment_method:
 *                 type: string
 *                 enum: [ORANGE_MONEY, MTN_MOMO, ESPECES]
 *               internal_reference: { type: string }
 *               payment_link_token: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Paiement initié
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 token: { type: string }
 *                 status: { type: string, enum: [EN_ATTENTE, RÉUSSI, ÉCHOUÉ, EXPIRÉ] }
 *                 created_at: { type: string, format: date-time }
 *                 amount: { type: string }
 *                 payment_method: { type: string }
 *       400:
 *         description: client_id manquant
 *       401:
 *         description: Identité gateway manquante (X-User-Id / X-User-Role)
 */
router.post('/api/v1/payments/initiate', requireGatewayIdentity, controller.initiate);

/**
 * @openapi
 * /api/v1/payments/{id}/status:
 *   get:
 *     summary: Interroger le statut d'un paiement déjà initié
 *     tags: [Intégration Reservation]
 *     security: [{ GatewayIdentity: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Identifiant du paiement (payment_links.id)
 *     responses:
 *       200:
 *         description: Dernier statut connu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 token: { type: string }
 *                 status: { type: string, enum: [EN_ATTENTE, RÉUSSI, ÉCHOUÉ, EXPIRÉ] }
 *                 created_at: { type: string, format: date-time }
 *                 amount: { type: string }
 *       401:
 *         description: Identité gateway manquante
 */
router.get('/api/v1/payments/:id/status', requireGatewayIdentity, controller.getStatus);

/**
 * @openapi
 * /api/v1/payments/cash/confirm:
 *   post:
 *     summary: Confirmer la remise en espèces
 *     description: >
 *       Utilisé quand le client a remis les espèces au chauffeur.
 *       Marque le paiement comme RÉUSSI.
 *     tags: [Intégration Reservation]
 *     security: [{ GatewayIdentity: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id: { type: string, example: "3" }
 *     responses:
 *       200:
 *         description: Paiement confirmé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 token: { type: string }
 *                 status: { type: string, example: RÉUSSI }
 *                 created_at: { type: string, format: date-time }
 *                 amount: { type: string }
 *       400:
 *         description: payment_id manquant
 *       401:
 *         description: Identité gateway manquante
 */
router.post('/api/v1/payments/cash/confirm', requireGatewayIdentity, controller.confirmCash);

module.exports = router;