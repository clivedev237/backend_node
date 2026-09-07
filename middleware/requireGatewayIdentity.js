/**
 * requireGatewayIdentity.js
 *
 * Le JWT est validé en amont par le Gateway (mode délégué, confirmé —
 * cadrage §14). Ce middleware ne valide AUCUN token : il vérifie juste que
 * le Gateway a bien posé une identité (X-User-Id, X-User-Role), exactement
 * comme GatewayHeaderAuthenticationFilter côté Spring Boot Reservation.
 *
 * Sans Gateway devant ce service en local, positionnez ces headers à la main
 * (Postman / curl -H) pour tester.
 */

'use strict';

function requireGatewayIdentity(req, res, next) {
  const userId = req.header('X-User-Id');
  const role   = req.header('X-User-Role');

  if (!userId || !role) {
    return res.status(401).json({ error: 'Identité manquante (Gateway requis en amont).' });
  }

  req.gatewayUser = { userId, role };
  next();
}

module.exports = requireGatewayIdentity;
