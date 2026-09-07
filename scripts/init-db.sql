-- ─────────────────────────────────────────────────────────────────────────
-- init-db.sql — tables nécessaires au module paiement.
--
-- ⚠️ À N'EXÉCUTER QUE SI ces tables n'existent pas déjà dans la base
-- partagée (par exemple si le service Auth complet n'est pas encore
-- déployé). Si "users" existe déjà avec un schéma différent, adaptez les
-- noms de colonnes dans payement/payment.service.js et
-- payement/payment.controller.js plutôt que d'exécuter ce script.
--
-- Utilisation : psql "$DATABASE_URL" -f scripts/init-db.sql
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id         BIGSERIAL PRIMARY KEY,
    role_id    INTEGER,
    first_name VARCHAR(100) NOT NULL,
    last_name  VARCHAR(100) NOT NULL,
    email      VARCHAR(150) UNIQUE,
    phone      VARCHAR(20)  UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_links (
    id            BIGSERIAL PRIMARY KEY,
    token         VARCHAR(64) UNIQUE NOT NULL,
    client_id     BIGINT NOT NULL REFERENCES users(id),
    amount        NUMERIC(10, 2) NOT NULL,
    devise        VARCHAR(10) NOT NULL DEFAULT 'XAF',
    langue        VARCHAR(5)  NOT NULL DEFAULT 'fr',
    description   TEXT,
    canal_envoi   VARCHAR(10),   -- 'mail' | 'sms' | NULL (paiement direct app)
    status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|paid|failed|expired
    soleaspay_ref VARCHAR(100),
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_client_id ON payment_links(client_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);

-- Un client de test pour vos premiers essais avec curl (numéro fictif) :
INSERT INTO users (first_name, last_name, email, phone)
VALUES ('Client', 'Test', 'client.test@vora.cm', '699000000')
ON CONFLICT (phone) DO NOTHING;
