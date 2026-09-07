/**
 * server.js — point d'entrée du service VORA Auth & Payment (partie Paiement).
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const db      = require('./config/database');

const app = express();

// ─── Middlewares globaux ────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());                          // pour les appels JSON (Spring, API)
app.use(express.urlencoded({ extended: true }));   // pour le formulaire HTML /pay/:token

// ─── Health check (utile pour Render et pour vos propres tests) ───────────
app.get('/actuator/health', (_req, res) => res.json({ status: 'UP' }));
app.get('/health', (_req, res) => res.json({ status: 'UP' }));

// ─── Routes métier ──────────────────────────────────────────────────────────
app.use('/', require('./payement/payment.routes'));              // flux web humain
app.use('/', require('./payement/payment.integration.routes'));   // contrat Spring

// ─── 404 générique ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8082;

app.listen(PORT, async () => {
  console.log(`🚀 VORA Payment Service démarré sur http://localhost:${PORT}`);
  await db.testConnection();
});
