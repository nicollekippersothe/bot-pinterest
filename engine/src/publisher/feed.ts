import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR, PUBLIC_PINS_DIR } from '../config/index.js';
import { listByStatus, updateOffer, type OfferRow } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { logger } from '../utils/logger.js';
import { writeRssFeed } from './rss.js';
import { parseHashtags } from './telegram.js';

/**
 * Publica as ofertas prontas como um feed estático dentro de `public/`.
 *
 * O Vite copia `public/` para `dist/`, que é o que a Vercel serve — então os
 * pins ganham uma URL pública sem serviço novo. O Pinterest precisa disso:
 * quem baixa a imagem é o servidor dele, não o navegador.
 *
 * O Make lê `feed.json` por HTTP e publica os itens.
 */

export interface FeedItem {
  id: number;
  title: string;
  description: string;
  hashtags: string[];
  /** Descrição + hashtags, pronta para colar no campo do Pinterest. */
  pinterestDescription: string;
  /** URL pública do pin 1000x1500. */
  imageUrl: string;
  /** Link de afiliado rastreado. */
  link: string;
  /** Quando entrou no feed (ISO 8601), para filtros por data no Make. */
  feedAt: string;
  price: number;
  originalPrice: number | null;
  discount: number;
  commissionRate: number | null;
  category: string | null;
}

/** Descrição final: texto de conversão + hashtags, dentro do limite do Pinterest. */
function buildPinterestDescription(offer: OfferRow): string {
  const description = offer.pin_description ?? offer.title;
  const hashtags = parseHashtags(offer.hashtags).slice(0, 6).join(' ');
  const combined = hashtags ? `${description}\n\n${hashtags}` : description;
  return combined.length <= 800 ? combined : combined.slice(0, 797).trimEnd() + '…';
}

function toFeedItem(offer: OfferRow, fileName: string, feedAt: string): FeedItem {
  return {
    id: offer.id,
    feedAt,
    title: (offer.pin_title ?? offer.title).slice(0, 100),
    description: offer.pin_description ?? '',
    hashtags: parseHashtags(offer.hashtags),
    pinterestDescription: buildPinterestDescription(offer),
    imageUrl: `${config.publicBaseUrl.replace(/\/+$/, '')}/pins/${fileName}`,
    link: offer.affiliate_url,
    price: offer.price,
    originalPrice: offer.original_price,
    discount: offer.discount,
    commissionRate: offer.commission_rate,
    category: offer.category,
  };
}

/**
 * Copia os pins para `public/pins/` e (re)escreve `public/feed.json`.
 *
 * Só entram ofertas ainda não enfileiradas (`feed_at` vazio), então rodar de
 * novo não duplica nada — mesma garantia do resto do pipeline.
 */
export function publishFeed(limit = config.publishBatchSize): FeedItem[] {
  if (!config.publicBaseUrl) {
    throw new Error(
      'PUBLIC_BASE_URL não configurada no .env (ex.: https://seu-app.vercel.app)',
    );
  }

  const ready = listByStatus(OFFER_STATUS.PROCESSED, 100).filter((offer) => !offer.feed_at);
  const batch = ready.slice(0, limit);

  if (batch.length === 0) {
    logger.info('Nenhuma oferta nova para o feed.');
    const current = readFeed();
    writeRssFeed(current);
    return current;
  }

  fs.mkdirSync(PUBLIC_PINS_DIR, { recursive: true });

  const added: FeedItem[] = [];
  for (const offer of batch) {
    if (!offer.pin_image_path || !fs.existsSync(offer.pin_image_path)) {
      logger.warn(`Oferta ${offer.id} sem imagem gerada — fora do feed.`);
      continue;
    }

    const fileName = path.basename(offer.pin_image_path);
    fs.copyFileSync(offer.pin_image_path, path.join(PUBLIC_PINS_DIR, fileName));

    const feedAt = new Date().toISOString();
    added.push(toFeedItem(offer, fileName, feedAt));
    updateOffer(offer.id, { feed_at: feedAt });
  }

  // O feed é uma janela dos itens mais recentes, não um arquivo histórico:
  // o Make consulta o Data Store item a item, e cada item custa operação.
  // Quem garante que nada é republicado é o Data Store, não o tamanho daqui.
  const feed = [...added, ...readFeed()].slice(0, config.feedMaxItems);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(feedPath(), JSON.stringify(feed, null, 2));
  writeRssFeed(feed);

  logger.success(`Feed atualizado: +${added.length} pin(s), ${feed.length} na janela`);
  logger.info(`Publique com: npm run build && vercel --prod (ou git push, se houver deploy automático)`);
  return feed;
}

function feedPath(): string {
  return path.join(PUBLIC_DIR, 'feed.json');
}

/** Lê o feed atual; devolve vazio se ainda não existir ou estiver corrompido. */
export function readFeed(): FeedItem[] {
  try {
    const raw = fs.readFileSync(feedPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeedItem[]) : [];
  } catch {
    return [];
  }
}
