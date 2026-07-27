import { getDb } from './db.js';
import { OFFER_STATUS, type OfferStatus } from './schema.js';
import type { MinedOffer } from '../miner/types.js';

export interface OfferRow {
  id: number;
  product_key: string;
  platform: string;
  title: string;
  original_url: string;
  affiliate_url: string;
  image_url: string | null;
  price: number;
  original_price: number | null;
  discount: number;
  rating: number | null;
  sold: number | null;
  category: string | null;
  status: OfferStatus;
  pin_image_path: string | null;
  pinterest_url: string | null;
  telegram_message_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
}

/** True quando o produto já existe no banco (em qualquer status). */
export function offerExists(productKey: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM offers WHERE product_key = ?')
    .get(productKey);
  return row !== undefined;
}

/** Filtra uma lista de ofertas mineradas, devolvendo só as inéditas. */
export function filterNewOffers(offers: MinedOffer[]): MinedOffer[] {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    if (seen.has(offer.productKey)) return false;
    seen.add(offer.productKey);
    return !offerExists(offer.productKey);
  });
}

/**
 * Insere a oferta. Se `product_key` já existir, nada acontece e o retorno é
 * `null` — é este `INSERT OR IGNORE` que impede repostagem do mesmo produto.
 */
export function insertOffer(offer: MinedOffer): OfferRow | null {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO offers
         (product_key, platform, title, original_url, affiliate_url, image_url,
          price, original_price, discount, rating, sold, category, status)
       VALUES
         (@productKey, @platform, @title, @originalUrl, @affiliateUrl, @imageUrl,
          @price, @originalPrice, @discount, @rating, @sold, @category, @status)`,
    )
    .run({
      productKey: offer.productKey,
      platform: offer.platform,
      title: offer.title,
      originalUrl: offer.originalUrl,
      affiliateUrl: offer.affiliateUrl,
      imageUrl: offer.imageUrl ?? null,
      price: offer.price,
      originalPrice: offer.originalPrice ?? null,
      discount: offer.discount ?? 0,
      rating: offer.rating ?? null,
      sold: offer.sold ?? null,
      category: offer.category ?? null,
      status: OFFER_STATUS.PENDING,
    });

  if (result.changes === 0) return null;
  return findByKey(offer.productKey);
}

/** Insere um lote e devolve apenas as ofertas realmente novas. */
export function insertOffers(offers: MinedOffer[]): OfferRow[] {
  const db = getDb();
  const insertMany = db.transaction((batch: MinedOffer[]) => {
    const inserted: OfferRow[] = [];
    for (const offer of batch) {
      const row = insertOffer(offer);
      if (row) inserted.push(row);
    }
    return inserted;
  });
  return insertMany(offers);
}

export function findByKey(productKey: string): OfferRow | null {
  const row = getDb()
    .prepare('SELECT * FROM offers WHERE product_key = ?')
    .get(productKey) as OfferRow | undefined;
  return row ?? null;
}

export function findById(id: number): OfferRow | null {
  const row = getDb().prepare('SELECT * FROM offers WHERE id = ?').get(id) as OfferRow | undefined;
  return row ?? null;
}

/** Ofertas aguardando processamento (copy/imagem) ou publicação. */
export function listByStatus(status: OfferStatus, limit = 20): OfferRow[] {
  return getDb()
    .prepare('SELECT * FROM offers WHERE status = ? ORDER BY discount DESC, created_at ASC LIMIT ?')
    .all(status, limit) as OfferRow[];
}

export function listRecent(limit = 20): OfferRow[] {
  return getDb()
    .prepare('SELECT * FROM offers ORDER BY created_at DESC LIMIT ?')
    .all(limit) as OfferRow[];
}

type OfferUpdate = Partial<
  Pick<
    OfferRow,
    'status' | 'pin_image_path' | 'pinterest_url' | 'telegram_message_id' | 'error' | 'posted_at'
  >
>;

/** Atualiza campos do pipeline; `updated_at` é sempre renovado. */
export function updateOffer(id: number, patch: OfferUpdate): void {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const assignments = entries.map(([column]) => `${column} = @${column}`).join(', ');
  getDb()
    .prepare(`UPDATE offers SET ${assignments}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...Object.fromEntries(entries), id });
}

/** Marca a oferta como publicada, registrando o horário. */
export function markPosted(
  id: number,
  channels: { pinterestUrl?: string; telegramMessageId?: string },
): void {
  updateOffer(id, {
    status: OFFER_STATUS.POSTED,
    pinterest_url: channels.pinterestUrl ?? null,
    telegram_message_id: channels.telegramMessageId ?? null,
    posted_at: new Date().toISOString(),
    error: null,
  });
}

export function markFailed(id: number, message: string): void {
  updateOffer(id, { status: OFFER_STATUS.FAILED, error: message.slice(0, 500) });
}

export function countByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS total FROM offers GROUP BY status')
    .all() as { status: string; total: number }[];
  return Object.fromEntries(rows.map((row) => [row.status, row.total]));
}
