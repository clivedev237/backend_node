/**
 * payment.service.js
 * Logique métier — adaptée à PostgreSQL (pilote "pg") et à l'intégration VORA.
 */

'use strict';

const crypto = require('crypto');
const axios  = require('axios');

/**
 * Crée un lien de paiement, le persiste en base et notifie le client.
 * @param {import('pg').Pool} db
 * @param {object} payload
 */
async function createPaymentLink(db, payload) {
  const {
    client_id, // ceci est un users.id (VORA) — voir résolution ci-dessous
    amount,
    description,
    devise     = 'XAF',
    langue     = 'fr',
    canal_envoi,
  } = payload;

  // 1. Vérifier que l'utilisateur VORA existe.
  const { rows: userRows } = await db.query(
    'SELECT id, first_name, last_name, email, phone FROM users WHERE id = $1',
    [client_id],
  );
  if (userRows.length === 0) {
    const err = new Error('Client introuvable.');
    err.status = 404;
    throw err;
  }
  const user = userRows[0];
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

  // 2. RÉSOLUTION CLIENTS ↔ USERS (découvert en inspectant le vrai schéma) :
  //    payment_links.client_id référence clients.id, PAS users.id.
  //    La table "clients" est reliée à "users" via clients.user_id (unique).
  //    On crée/mets à jour la ligne clients correspondante avant d'insérer
  //    le paiement. city/contact_name/email/phone sont NOT NULL sur clients.
  const { rows: clientRows } = await db.query(
    `INSERT INTO clients (contact_name, email, phone, city, user_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       contact_name = EXCLUDED.contact_name,
       email        = EXCLUDED.email,
       phone        = EXCLUDED.phone,
       updated_at   = now()
     RETURNING id`,
    [fullName || 'Client VORA', user.email, user.phone, 'Yaoundé', user.id],
  );
  const clientsRowId = clientRows[0].id;

  // 3. Générer un token unique.
  const token      = crypto.randomBytes(24).toString('hex');
  const BASE_URL   = process.env.APP_BASE_URL || 'http://localhost:3000';
  const paymentUrl = `${BASE_URL}/pay/${token}`;

  // 4. Persister le lien en base avec clients.id (pas users.id !).
  const { rows: inserted } = await db.query(
    `INSERT INTO payment_links
       (token, client_id, amount, devise, langue, description, canal_envoi, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', now(), now())
     RETURNING id, created_at`,
    [token, clientsRowId, amount, devise, langue, description, canal_envoi],
  );
  const { id: paymentLinkId, created_at: createdAt } = inserted[0];

  // 5. Notifier le client selon le canal choisi (facultatif : peut être null
  //    quand l'initiation vient de Réservation, voir payment.integration.service.js).
  if (canal_envoi === 'mail') {
    await _sendMail(user, fullName, paymentUrl, amount, devise, description);
  } else if (canal_envoi === 'sms') {
    await _sendSms(user, fullName, paymentUrl, amount);
  }

  return {
    id: paymentLinkId,
    url: paymentUrl,
    token,
    createdAt,
    ...payload,
    name   : fullName,
    email  : user.email,
    mobile : user.phone,
  };
}

/**
 * Récupère les détails d'un lien de paiement (utilisé par la page web cliente).
 * @param {import('pg').Pool} db
 * @param {string} token
 */
async function getPaymentDetails(db, token) {
  const { rows } = await db.query(
    `SELECT pl.id, pl.token, pl.amount, pl.devise, pl.langue, pl.description,
            pl.status, pl.created_at, pl.soleaspay_ref,
            c.contact_name, c.email, c.phone
     FROM   payment_links pl
     JOIN   clients c ON pl.client_id = c.id
     WHERE  pl.token = $1`,
    [token],
  );
  if (rows.length === 0) {
    const err = new Error('Lien invalide ou inexistant.');
    err.status = 404;
    throw err;
  }
  const row = rows[0];
  return {
    ...row,
    name: row.contact_name,
    mobile: row.phone,
  };
}

/**
 * Récupère un lien de paiement par son id numérique (utilisé par la couche
 * d'intégration Spring : GET /api/v1/payments/{id}/status).
 * @param {import('pg').Pool} db
 * @param {number|string} id
 */
async function getPaymentById(db, id) {
  const { rows } = await db.query(
    `SELECT pl.id, pl.token, pl.amount, pl.devise, pl.status, pl.updated_at,
            pl.description
     FROM   payment_links pl
     WHERE  pl.id = $1`,
    [id],
  );
  if (rows.length === 0) {
    const err = new Error('Paiement introuvable.');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

/**
 * Initie le paiement via l'API Soleaspay v3.
 * @param {import('pg').Pool} db
 * @param {object} payload
 */
async function processSoleaspay(db, payload) {
  const { token, mode_paiement, numero_payeur } = payload;

  const { rows } = await db.query(
    `SELECT pl.*, c.contact_name, c.email AS client_email, c.phone
     FROM payment_links pl
     JOIN clients c ON pl.client_id = c.id
     WHERE pl.token = $1 AND pl.status = 'pending'`,
    [token],
  );
  if (rows.length === 0) {
    const err = new Error('Paiement introuvable, déjà traité ou expiré.');
    err.status = 404;
    throw err;
  }
  const payment = rows[0];
  const clientFullName = payment.contact_name || 'Client';

  const baseUrl   = (process.env.SOLEASPAY_BASE_URL || 'https://soleaspay.com').replace(/\/$/, '');
  const targetUrl = `${baseUrl}/api/agent/bills/v3`;

  const paymentBody = {
    wallet      : numero_payeur || payment.phone,
    amount      : Math.round(parseFloat(payment.amount)),
    currency    : payment.devise || 'XAF',
    order_id    : `VORA-${payment.id}-${Date.now().toString().slice(-4)}`,
    description : payment.description || 'Paiement course VORA',
    payer       : clientFullName,
    payerEmail  : payment.client_email || 'client@vora.cm',
    successUrl  : `${process.env.APP_BASE_URL || 'http://localhost:3000'}/payment-success`,
    failureUrl  : `${process.env.APP_BASE_URL || 'http://localhost:3000'}/payment-fail`,
  };

  console.log(`🚀 [PaymentService v3] POST → ${targetUrl}`);

  let data;
  try {
    const response = await axios.post(targetUrl, paymentBody, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SOLEASPAY_BEARER_TOKEN}`,
        'operation': process.env.SOLEASPAY_OPERATION || 'PAY-IN',
        'service': process.env.SOLEASPAY_SERVICE || 'MOBILE_MONEY',
        'x-api-key': process.env.SOLEASPAY_API_KEY,
      },
      timeout: 20000,
    });
    data = response.data;
  } catch (axiosErr) {
    const errBody   = axiosErr.response?.data;
    const errStatus = axiosErr.response?.status || 502;
    console.error('❌ [Soleaspay v3] Réponse erreur :', errBody || axiosErr.message);
    const err = new Error(
      `Soleaspay v3 a refusé la transaction (HTTP ${errStatus}) : ${errBody?.message || axiosErr.message}`,
    );
    err.status = errStatus;
    throw err;
  }

  const soleaspayRef =
    data.reference ||
    data.soleaspay_ref ||
    (data.data ? data.data.reference : null) ||
    data.order_id;

  if (!soleaspayRef) {
    const err = new Error(
      `L'agrégateur a traité la requête mais aucune référence n'a été récupérée. Message : ${data.message || 'Inconnu'}`,
    );
    err.status = 502;
    throw err;
  }

  await db.query(
    'UPDATE payment_links SET soleaspay_ref = $1, updated_at = now() WHERE id = $2',
    [soleaspayRef, payment.id],
  );

  return {
    message     : 'Demande de paiement v3 initiée. Veuillez valider sur votre téléphone.',
    soleaspayRef,
  };
}

/**
 * Confirme un paiement en espèces (pas d'appel Soleaspay : l'argent a déjà
 * été remis physiquement au chauffeur). Utilisé par la couche d'intégration
 * Spring : POST /api/v1/payments/cash/confirm.
 * @param {import('pg').Pool} db
 * @param {number|string} id
 */
async function confirmCash(db, id) {
  const { rows } = await db.query(
    `UPDATE payment_links
     SET status = 'paid', soleaspay_ref = COALESCE(soleaspay_ref, 'CASH-' || id), updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, token, amount, devise, status, updated_at`,
    [id],
  );
  if (rows.length === 0) {
    // Idempotence : si déjà payé, on renvoie l'état actuel plutôt qu'une erreur.
    return getPaymentById(db, id);
  }
  return rows[0];
}

/**
 * Webhook appelé par Soleaspay pour notifier le résultat final.
 * @param {import('pg').Pool} db
 */
async function handleWebhook(db, body) {
  const { status, soleaspay_ref } = body;
  const newStatus = status === 'SUCCESS' ? 'paid' : 'failed';

  await db.query(
    'UPDATE payment_links SET status = $1, updated_at = now() WHERE soleaspay_ref = $2',
    [newStatus, soleaspay_ref],
  );
}

// ─── Helpers privés ────────────────────────────────────────────────────────

async function _sendMail(user, fullName, paymentUrl, amount, devise, description) {
  console.log(
    `\n📧 [MAIL] → ${user.email} | Bonjour ${fullName},\n` +
    `Votre course VORA d'un montant de ${amount} ${devise} (${description}) est à régler.\n` +
    `Lien de paiement : ${paymentUrl}\n`,
  );
}

async function _sendSms(user, fullName, paymentUrl, amount) {
  console.log(
    `\n💬 [SMS] → ${user.phone} | Payez votre course VORA de ${amount} FCFA via ce lien : ${paymentUrl}\n`,
  );
}

module.exports = {
  createPaymentLink,
  getPaymentDetails,
  getPaymentById,
  processSoleaspay,
  confirmCash,
  handleWebhook,
};