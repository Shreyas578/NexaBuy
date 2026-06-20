-- NexaBuy PostgreSQL Schema
-- Vercel Postgres / Neon compatible
-- Run once via Neon dashboard SQL editor or psql

CREATE TABLE IF NOT EXISTS watchlist (
  id               SERIAL PRIMARY KEY,
  session_id       VARCHAR(64)   NOT NULL,
  url              TEXT          NOT NULL,
  product_name     VARCHAR(512),
  price            DECIMAL(10,2),
  currency         VARCHAR(10)   DEFAULT 'USD',
  verdict          VARCHAR(50),
  image_url        TEXT,
  last_checked_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlist_session ON watchlist (session_id);
