/**
 * payment.integration.service.js
 *
 * Couche de compatibilité entre le microservice Spring Boot Réservation
 * (PaymentClient.java, cadrage §9.2) et la logique Soleaspay déjà écrite
 * dans payment.service.js. Le code existant (create-link / process /
 * webhook) n'est PAS dupliqué : cette couche l'appelle et reformate.
 *
 * Contrat exposé (voir PaymentClient.java côté Spring) :
 *  - initiate(request)      → POST /api/v1/payments/initiate
 *  - getStatus(id)          → GET  /api/v1/payments/{id}/status
 *  - confirmCash(id)        → POST /api/v1/payments/cash/confirm
 *
 * Spring envoie/attend du JSON en snake_case (voir PaymentClientConfig.java,
 * ObjectMapper dédié SNAKE_CASE) : les clés ci-dessous (client_id, amount,
 * payment_method, created_at...) doivent rester en snake_case.
 */

'use strict';

const paymentService = require('./payment.service');

/**
 * Traduction PaymentRefStatus <-> statut local payment_links.
 * Garder ces valeurs synchronisées avec PaymentService#mapNodeStatusToLocal
 * côté Spring (EN_ATTENTE / RÉUSSI / ÉCHOUÉ / EXPIRÉ).
 */
function toSpringStatus(pgStatus) {
  switch (pgStatus) {
    case 'pending': return 'EN_ATTENTE';
    case 'paid':    return 'RÉUSSI';
    case 'failed':  return 'ÉCHOUÉ';
    case 'expired': return 'EXPIRÉ';
    default:        return 'EN_ATTENTE';
  }
}

function toResponseShape(row) {
  return {
    id            : String(row.id),
    token         : row.token || null,
    status        : toSpringStatus(row.status),
    created_at    : row.created_at || row.updated_at || new Date().toISOString(),
    amount        : String(row.amount),
    payment_method: row.payment_method || undefined,
  };
}

/**
 * POST /api/v1/payments/initiate
 *
 * @param {import('pg').Pool} db
 * @param {object} body — voir InitiatePaymentRequest.java (snake_case)
 *   { client_id, amount, currency, language, channel, payment_method,
 *     internal_reference, payment_link_token, description }
 */
async function initiate(db, body) {
  const {
    client_id,
    amount,
    currency = 'XAF',
    language = 'fr',
    payment_method,
    description,
  } = body;

  if (!client_id) {
    const err = new Error('client_id manquant : impossible de savoir qui facturer.');
    err.status = 400;
    throw err;
  }

  // 1. Créer systématiquement l'enregistrement local (traçabilité), sans
  //    envoyer de lien par mail/sms — c'est Réservation qui pilote le
  //    paiement depuis l'app, pas un lien web (canal_envoi = null).
  const created = await paymentService.createPaymentLink(db, {
    client_id,
    amount,
    description: description || 'Course VORA',
    devise: currency,
    langue: language,
    canal_envoi: null,
  });

  // 2. ESPECES : rien à envoyer à l'agrégateur. Le statut reste "pending"
  //    jusqu'à ce que le chauffeur confirme via /cash/confirm.
  if (payment_method === 'ESPECES') {
    return { ...toResponseShape({
      id: created.id, token: created.token, status: 'pending',
      created_at: created.createdAt, amount,
    }), payment_method };
  }

  // 3. ORANGE_MONEY / MTN_MOMO : on déclenche Soleaspay tout de suite avec
  //    le numéro déjà connu du client (users.phone), sans passer par la
  //    page web /pay/:token (celle-ci reste disponible pour d'autres usages,
  //    ex. dashboard, mais n'est pas utilisée dans ce flux backend-to-backend).
  await paymentService.processSoleaspay(db, {
    token: created.token,
    mode_paiement: payment_method,
    numero_payeur: created.mobile,
  });

  const row = await paymentService.getPaymentById(db, created.id);
  return { ...toResponseShape(row), payment_method };
}

/**
 * GET /api/v1/payments/{id}/status
 */
async function getStatus(db, id) {
  const row = await paymentService.getPaymentById(db, id);
  return toResponseShape(row);
}

/**
 * POST /api/v1/payments/cash/confirm
 * body attendu : { payment_id }  (voir CashConfirmRequest.java)
 */
async function confirmCash(db, paymentId) {
  const row = await paymentService.confirmCash(db, paymentId);
  return toResponseShape(row);
}

module.exports = { initiate, getStatus, confirmCash };
