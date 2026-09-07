# VORA Payment Service

Service Node.js/Express/PostgreSQL qui expose :
- le contrat attendu par Spring Boot Reservation (`/api/v1/payments/...`)
- le flux de paiement web historique (`/pay/:token`, lien envoyé par mail/sms)

## Exécution en 4 commandes

```bash
npm install
cp .env.example .env
# → ouvrez .env et renseignez au minimum DATABASE_URL
psql "$DATABASE_URL" -f scripts/init-db.sql   # une seule fois, voir note ci-dessous
npm start
```

Le serveur démarre sur `http://localhost:8082` (configurable via `PORT`
dans `.env`).

## ⚠️ Note sur `scripts/init-db.sql`

Ce script crée les tables `users` et `payment_links` **si elles n'existent
pas déjà**. Si votre équipe a déjà une base partagée avec Spring Boot
Reservation contenant une vraie table `users` (gérée par un autre service
Auth), **ne lancez pas ce script** — vérifiez d'abord avec :
```bash
psql "$DATABASE_URL" -c "\d users"
```
Si la table existe avec des colonnes différentes (ex. `full_name` au lieu
de `first_name`/`last_name`), adaptez les requêtes dans
`payement/payment.service.js` et `payement/payment.controller.js` en
conséquence plutôt que d'exécuter le script.

## Tester que ça fonctionne

```bash
# 1. Health check
curl http://localhost:8082/health

# 2. Initier un paiement (comme le ferait Spring)
curl -X POST http://localhost:8082/api/v1/payments/initiate \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" -H "X-User-Role: CLIENT" \
  -d '{
    "client_id": 1,
    "amount": 1000,
    "currency": "XAF",
    "payment_method": "ESPECES",
    "internal_reference": "test-1",
    "description": "Course test"
  }'

# 3. Consulter le statut (remplacez 1 par l'id renvoyé à l'étape 2)
curl http://localhost:8082/api/v1/payments/1/status \
  -H "X-User-Id: 1" -H "X-User-Role: CLIENT"

# 4. Confirmer un paiement espèces
curl -X POST http://localhost:8082/api/v1/payments/cash/confirm \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" -H "X-User-Role: CLIENT" \
  -d '{"payment_id": "1"}'
```

Testez ESPECES d'abord (étapes ci-dessus) : ça ne nécessite aucune clé
Soleaspay. Une fois validé, testez ORANGE_MONEY/MTN_MOMO en remplissant
les vraies clés `SOLEASPAY_*` dans `.env`.

## Structure du projet

```
server.js                            point d'entrée
config/database.js                   connexion PostgreSQL (pool pg)
services/email.service.js            envoi d'email (stub console pour l'instant)
middleware/requireGatewayIdentity.js sécurité minimale (headers Gateway)
payement/
  payment.service.js                 logique métier (create-link, Soleaspay, webhook)
  payment.controller.js              handlers Express du flux web
  payment.routes.js                  routes du flux web (/pay/:token, ...)
  payment.integration.service.js     logique du contrat attendu par Spring
  payment.integration.controller.js  handlers Express du contrat Spring
  payment.integration.routes.js      routes /api/v1/payments/* (Spring)
scripts/init-db.sql                  création des tables si nécessaire
```

## Points à personnaliser avant la production

- `services/email.service.js` : remplacer le stub console par un vrai envoi
  (ex. `npm install nodemailer` + configuration SMTP).
- `.env` : renseigner les vraies clés `SOLEASPAY_*`.
- `DATABASE_SSL=true` en production (Render l'exige).
- `CORS_ORIGIN` : mettre l'URL réelle du frontend Vercel, pas `*`.
