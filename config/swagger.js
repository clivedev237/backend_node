'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'VORA Auth & Payment Service',
      version: '1.0.0',
      description:
        "Documentation de l'API paiement — endpoints humains (/api/payments/*, /pay/:token) " +
        "et endpoints inter-services consommés par Spring Boot Reservation (/api/v1/payments/*).",
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 8085}`, description: 'Local' },
      { url: process.env.APP_BASE_URL || '', description: 'Déployé (Render)' },
    ],
    components: {
      securitySchemes: {
        GatewayIdentity: {
          type: 'apiKey',
          in: 'header',
          name: 'X-User-Id',
          description: "Identité posée par le Gateway en amont (X-User-Id + X-User-Role requis).",
        },
      },
    },
  },
  // Fichiers scannés pour les commentaires JSDoc @openapi / @swagger
  apis: ['./payement/*.js', './server.js'],
};

module.exports = swaggerJsdoc(options);