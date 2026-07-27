/**
 * Schema do SQLite.
 *
 * `product_key` é UNIQUE e é o que garante que o mesmo produto nunca seja
 * reprocessado nem repostado — toda inserção passa por `INSERT OR IGNORE`.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key    TEXT    NOT NULL UNIQUE,
  platform       TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  original_url   TEXT    NOT NULL,
  affiliate_url  TEXT    NOT NULL,
  image_url      TEXT,
  price          REAL    NOT NULL,
  original_price REAL,
  discount       INTEGER NOT NULL DEFAULT 0,
  rating         REAL,
  sold           INTEGER,
  category       TEXT,
  status         TEXT    NOT NULL DEFAULT 'pending',
  pin_image_path TEXT,
  pinterest_url  TEXT,
  telegram_message_id TEXT,
  error          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  posted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_offers_status   ON offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_platform ON offers (platform);
CREATE INDEX IF NOT EXISTS idx_offers_posted   ON offers (posted_at);
`;

/** Estados possíveis de uma oferta ao longo do pipeline. */
export const OFFER_STATUS = {
  /** Minerada, ainda sem copy/imagem. */
  PENDING: 'pending',
  /** Copy e pin gerados, pronta para publicar. */
  PROCESSED: 'processed',
  /** Publicada em pelo menos um canal. */
  POSTED: 'posted',
  /** Falhou em alguma etapa; `error` guarda o motivo. */
  FAILED: 'failed',
} as const;

export type OfferStatus = (typeof OFFER_STATUS)[keyof typeof OFFER_STATUS];
