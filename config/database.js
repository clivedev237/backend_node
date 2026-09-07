/**
 * config/database.js
 * Pool de connexions PostgreSQL, partagé par tout le service.
 *
 * DATABASE_URL doit pointer vers la MÊME instance Render que
 * SPRING_DATASOURCE_URL côté Spring Boot Reservation (base partagée,
 * schéma "public" commun — voir cadrage VORA).
 */

'use strict';

const { Pool } = require('pg');

const useSsl = (process.env.DATABASE_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('❌ [PostgreSQL] Erreur inattendue sur une connexion inactive :', err.message);
});

// Test de connexion au démarrage — permet de détecter immédiatement une
// mauvaise DATABASE_URL plutôt qu'à la première requête d'un utilisateur.
async function testConnection() {
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT current_database() AS db, now() AS server_time');
    console.log(`✅ [PostgreSQL] Connecté à "${rows[0].db}" (heure serveur : ${rows[0].server_time})`);
    client.release();
  } catch (err) {
    console.error('❌ [PostgreSQL] Impossible de se connecter :', err.message);
    console.error('   Vérifiez DATABASE_URL dans votre fichier .env');
  }
}

module.exports = pool;
module.exports.testConnection = testConnection;
