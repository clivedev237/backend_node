/**
 * payment.integration.controller.js
 * Handlers Express pour le contrat attendu par Spring Boot Reservation.
 */

'use strict';

const integrationService = require('./payment.integration.service');
const { pool } = require('./payment.controller'); // réutilise le même pool pg

// POST /api/v1/payments/initiate
async function initiate(req, res) {
  try {
    const result = await integrationService.initiate(pool, req.body);
    return res.status(201).json(result);
  } catch (err) {
    console.error('[payments/initiate]', err);
    return res.status(err.status || 502).json({ error: err.message });
  }
}

// GET /api/v1/payments/:id/status
async function getStatus(req, res) {
  try {
    const result = await integrationService.getStatus(pool, req.params.id);
    return res.json(result);
  } catch (err) {
    console.error('[payments/status]', err);
    return res.status(err.status || 502).json({ error: err.message });
  }
}

// POST /api/v1/payments/cash/confirm
async function confirmCash(req, res) {
  const paymentId = req.body.payment_id;
  if (!paymentId) {
    return res.status(400).json({ error: 'payment_id manquant.' });
  }
  try {
    const result = await integrationService.confirmCash(pool, paymentId);
    return res.json(result);
  } catch (err) {
    console.error('[payments/cash/confirm]', err);
    return res.status(err.status || 502).json({ error: err.message });
  }
}

module.exports = { initiate, getStatus, confirmCash };
