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

router.post('/api/v1/payments/initiate', requireGatewayIdentity, controller.initiate);
router.get('/api/v1/payments/:id/status', requireGatewayIdentity, controller.getStatus);
router.post('/api/v1/payments/cash/confirm', requireGatewayIdentity, controller.confirmCash);

module.exports = router;
