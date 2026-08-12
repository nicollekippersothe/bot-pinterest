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
  commission_rate REAL,
  shop_name      TEXT,
  status         TEXT    NOT NULL DEFAULT 'pending',
  pin_title      TEXT,
  pin_description TEXT,
  hashtags       TEXT,
  telegram_caption TEXT,
  copy_source    TEXT,
  feed_at        TEXT,
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

/**
 * Colunas adicionadas depois da Fase 1. Como `CREATE TABLE IF NOT EXISTS` não
 * altera tabelas existentes, elas são aplicadas na conexão via ALTER TABLE.
 */
export const OFFER_COLUMNS: { name: string; definition: string }[] = [
  { name: 'pin_title', definition: 'TEXT' },
  { name: 'pin_description', definition: 'TEXT' },
  { name: 'hashtags', definition: 'TEXT' },
  { name: 'telegram_caption', definition: 'TEXT' },
  { name: 'copy_source', definition: 'TEXT' },
  { name: 'commission_rate', definition: 'REAL' },
  { name: 'shop_name', definition: 'TEXT' },
  { name: 'feed_at', definition: 'TEXT' },
];

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
