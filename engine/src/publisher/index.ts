import { listByStatus, markFailed, markPosted, type OfferRow } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { logger } from '../utils/logger.js';
import { isTelegramConfigured, publishToTelegram } from './telegram.js';

export interface PublishResult {
  offer: OfferRow;
  telegramMessageId?: string;
}

/** Intervalo entre publicações — cadência conservadora evita bloqueio. */
const DELAY_BETWEEN_POSTS_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publica as ofertas já processadas nos canais configurados.
 *
 * Hoje só o Telegram está implementado; quando a Fase 4 (Pinterest) entrar,
 * as duas publicações acontecem antes de a oferta virar `posted`.
 */
export async function publishProcessed(limit = 5): Promise<PublishResult[]> {
  if (!isTelegramConfigured()) {
    logger.warn('Telegram não configurado — pulando publicação. Preencha o .env para ativar.');
    return [];
  }

  const ready = listByStatus(OFFER_STATUS.PROCESSED, limit);
  if (ready.length === 0) {
    logger.info('Nenhuma oferta pronta para publicar.');
    return [];
  }

  logger.info(`Publicando ${ready.length} oferta(s) no Telegram...`);
  const published: PublishResult[] = [];

  for (const [index, offer] of ready.entries()) {
    try {
      const { messageId } = await publishToTelegram(offer);
      markPosted(offer.id, { telegramMessageId: messageId });
      published.push({ offer, telegramMessageId: messageId });
    } catch (error) {
      const message = (error as Error).message;
      markFailed(offer.id, message);
      logger.error(`Falha ao publicar "${offer.title}": ${message}`);
    }

    if (index < ready.length - 1) await sleep(DELAY_BETWEEN_POSTS_MS);
  }

  return published;
}

export {
  publishToTelegram,
  isTelegramConfigured,
  checkTelegramAccess,
  buildCaption,
} from './telegram.js';
export { publishFeed, readFeed, type FeedItem } from './feed.js';
