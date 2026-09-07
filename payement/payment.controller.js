/**
 * payment.controller.js
 * Handlers Express — adapté à PostgreSQL (pilote "pg").
 *
 * CHANGEMENTS PAR RAPPORT À LA VERSION D'ORIGINE :
 * - pool.execute(...) (MySQL) → pool.query(...) (PostgreSQL).
 * - placeholders "?" → "$1, $2, ...".
 * - table "clients" → table "users" (Auth), voir payment.service.js.
 */

'use strict';

const paymentService = require('./payment.service');
const dbConfig       = require('../config/database');
const emailService   = require('../services/email.service');

// ─── Résolution robuste de l'instance PostgreSQL (pool "pg") ──────────────────
const pool = (typeof dbConfig.query === 'function')
  ? dbConfig
  : (dbConfig.pool || dbConfig.connection || null);

if (!pool || typeof pool.query !== 'function') {
  throw new Error(
    '❌ [PaymentController] Impossible de trouver une instance PostgreSQL avec .query() dans config/database. ' +
    'Vérifiez votre export dans ce fichier (pool "pg", pas mysql2).',
  );
}

const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clients/search?nom=...
// ─────────────────────────────────────────────────────────────────────────────
async function searchClient(req, res) {
  const { nom } = req.query;

  if (!nom || nom.trim().length < 2) {
    return res.status(400).json({ error: 'Paramètre "nom" requis (min 2 caractères).' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone
       FROM users
       WHERE (first_name || ' ' || last_name) ILIKE $1
       LIMIT 8`,
      [`%${nom.trim()}%`],
    );

    const formattedRows = rows.map(u => ({
      id   : u.id,
      nom  : `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      email: u.email,
      phone: u.phone,
    }));

    return res.json(formattedRows);
  } catch (err) {
    console.error('[searchClient]', err);
    return res.status(500).json({ error: 'Erreur lors de la recherche.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/create-link
// ─────────────────────────────────────────────────────────────────────────────
async function createLink(req, res) {
  const { client_id, amount, description, devise, langue, canal_envoi } = req.body;

  if (!client_id || !amount || !canal_envoi) {
    return res.status(400).json({
      error: 'Champs obligatoires manquants : client_id, amount, canal_envoi.',
    });
  }

  try {
    const result = await paymentService.createPaymentLink(pool, {
      client_id, amount, description, devise, langue, canal_envoi,
    });

    const { rows: userRows } = await pool.query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [client_id],
    );
    const clientName  = userRows[0]
      ? `${userRows[0].first_name || ''} ${userRows[0].last_name || ''}`.trim()
      : 'Client VORA';
    const clientEmail = userRows[0]?.email || 'sandbox@vora.cm';

    const paymentUrl = `${BASE_URL}/pay/${result.token}`;

    emailService.sendPaymentLinkEmail(
      clientEmail, clientName, paymentUrl, amount, devise || 'XAF', description,
    )
      .then(() => console.log(`✉️  Notification envoyée à ${clientName}`))
      .catch((mailErr) => console.warn(`⚠️  Email non envoyé : ${mailErr.message}`));

    return res.status(201).json({ success: true, ...result, url: paymentUrl });
  } catch (err) {
    console.error('[createLink]', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /pay/:token   ET   GET /api/payments/details/:token
// ─────────────────────────────────────────────────────────────────────────────
async function getDetails(req, res) {
  try {
    const { token } = req.params;
    const data      = await paymentService.getPaymentDetails(pool, token);

    const amount      = data.amount      || 0;
    const devise      = data.devise      || 'XAF';
    const bonRef      = data.description || 'Paiement VORA';
    const clientName  = data.name        || 'Client VORA';
    const clientPhone = data.mobile      || '';

    return res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VORA Pay - Paiement Sécurisé</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-white flex items-center justify-center min-h-screen p-4 font-sans">
  <div class="bg-gray-900 p-6 rounded-2xl shadow-2xl w-full max-w-md border border-gray-800">
    <div class="text-center mb-6">
      <h1 class="text-xl font-bold tracking-tight text-white">VORA Pay</h1>
      <p class="text-gray-400 text-xs mt-0.5">${bonRef}</p>
    </div>
    <form action="${BASE_URL}/api/payments/process" method="POST" class="space-y-4">
      <input type="hidden" name="token" value="${token}">
      <div class="bg-gray-950 p-4 rounded-xl text-center mb-6 border border-emerald-500/10">
        <span class="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">Montant</span>
        <div class="text-3xl font-black text-white mt-0.5">${amount} ${devise}</div>
        <div class="text-xs text-gray-400 mt-2 border-t border-gray-900 pt-2">
          <span class="text-gray-500">Bénéficiaire :</span>
          <span class="font-semibold text-gray-300">${clientName}</span>
        </div>
      </div>
      <div>
        <label class="block text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Opérateur</label>
        <div class="grid grid-cols-2 gap-3">
          <label class="relative flex flex-col items-center justify-center p-3 bg-gray-950 border-2 border-amber-500 rounded-xl cursor-pointer">
            <input type="radio" name="operator" value="MTN" checked class="absolute top-2 right-2 accent-amber-500 w-4 h-4">
            <span class="text-xs font-bold text-amber-400">MTN MoMo</span>
          </label>
          <label class="relative flex flex-col items-center justify-center p-3 bg-gray-950 border border-gray-800 rounded-xl cursor-pointer">
            <input type="radio" name="operator" value="ORANGE" class="absolute top-2 right-2 accent-orange-500 w-4 h-4">
            <span class="text-xs font-bold text-orange-500">Orange Money</span>
          </label>
        </div>
      </div>
      <div>
        <label class="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">Numéro de téléphone</label>
        <input type="tel" required name="phone" value="${clientPhone}" placeholder="Ex: 657847013"
          class="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-semibold tracking-widest focus:outline-none focus:border-emerald-500" />
      </div>
      <button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-600 text-gray-950 font-extrabold py-3.5 rounded-xl transition-all mt-6">
        Confirmer &amp; Payer
      </button>
    </form>
  </div>
</body>
</html>
    `);
  } catch (err) {
    console.error('[getDetails]', err);
    const status = err.status || 500;
    return res.status(status).send(_htmlError(
      status === 404 ? 'Lien invalide ou expiré' : 'Erreur serveur', err.message,
    ));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/process
// ─────────────────────────────────────────────────────────────────────────────
async function processPayment(req, res) {
  const token          = req.body.token;
  const mode_paiement  = req.body.mode_paiement || req.body.operator;
  const numero_payeur  = req.body.numero_payeur || req.body.phone;

  if (!token || !mode_paiement || !numero_payeur) {
    return res.status(400).json({
      error: 'Champs obligatoires manquants : token, mode_paiement (ou operator), numero_payeur (ou phone).',
    });
  }

  try {
    const result = await paymentService.processSoleaspay(pool, { token, mode_paiement, numero_payeur });

    const isFormSubmit =
      (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded') ||
      !!req.body.operator;

    if (isFormSubmit) {
      return res.send(`
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Paiement initié</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white flex items-center justify-center min-h-screen p-4 font-sans">
  <div class="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-emerald-800 text-center">
    <div class="text-5xl mb-4">✅</div>
    <h1 class="text-2xl font-bold text-emerald-400 mb-2">Paiement Initié !</h1>
    <p class="text-gray-300">Veuillez valider le prompt USSD reçu sur votre téléphone.</p>
    <p class="text-gray-500 text-xs mt-4">Référence : ${result.soleaspayRef}</p>
  </div>
</body>
</html>
      `);
    }
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[processPayment]', err);
    const isFormSubmit = (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded') || !!req.body.operator;
    if (isFormSubmit) {
      return res.status(err.status || 500).send(_htmlError('Échec du paiement', err.message));
    }
    return res.status(err.status || 500).json({ error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// ─────────────────────────────────────────────────────────────────────────────
async function webhook(req, res) {
  try {
    await paymentService.handleWebhook(pool, req.body);
    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err);
    return res.sendStatus(500);
  }
}

function _htmlError(title, message) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${title}</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-950 text-white flex items-center justify-center min-h-screen p-4 font-sans">
  <div class="text-center">
    <div class="text-5xl mb-4">❌</div>
    <h1 class="text-2xl font-bold text-red-400 mb-2">${title}</h1>
    <p class="text-gray-400">${message}</p>
  </div>
</body>
</html>`;
}

module.exports = { searchClient, createLink, getDetails, processPayment, webhook, pool };
