import { listByStatus, markFailed, updateOffer, type OfferRow } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { logger } from '../utils/logger.js';
import { generateCopy, type GeneratedCopy } from './copywriter.js';
import { generatePin } from './image.js';

export interface ProcessedOffer {
  offer: OfferRow;
  copy: GeneratedCopy;
  pinImagePath: string;
}

/**
 * Enriquece uma oferta: copy pela IA + pin 1000x1500 pelo sharp.
 * Ao final a oferta fica em `processed`, pronta para as Fases 4 e 5.
 */
export async function processOffer(offer: OfferRow): Promise<ProcessedOffer> {
  const copy = await generateCopy(offer);
  const pin = await generatePin(offer);

  updateOffer(offer.id, {
    status: OFFER_STATUS.PROCESSED,
    pin_title: copy.pinTitle,
    pin_description: copy.pinDescription,
    hashtags: JSON.stringify(copy.hashtags),
    telegram_caption: copy.telegramCaption,
    copy_source: copy.source,
    pin_image_path: pin.filePath,
    error: null,
  });

  logger.success(`Processada [${copy.source}] ${copy.pinTitle}`);
  return { offer, copy, pinImagePath: pin.filePath };
}

/**
 * Processa a fila de pendentes. Uma falha isolada marca só aquela oferta como
 * `failed` — as demais seguem normalmente.
 */
export async function processPending(limit = 10): Promise<ProcessedOffer[]> {
  const pending = listByStatus(OFFER_STATUS.PENDING, limit);
  if (pending.length === 0) {
    logger.info('Nenhuma oferta pendente para processar.');
    return [];
  }

  logger.info(`Processando ${pending.length} oferta(s) pendente(s)...`);
  const processed: ProcessedOffer[] = [];

  for (const offer of pending) {
    try {
      processed.push(await processOffer(offer));
    } catch (error) {
      const message = (error as Error).message;
      markFailed(offer.id, message);
      logger.error(`Falha ao processar "${offer.title}": ${message}`);
    }
  }

  return processed;
}

export { generateCopy, buildFallbackCopy } from './copywriter.js';
export { generatePin, buildPinImage, downloadImage } from './image.js';
export type { GeneratedCopy } from './copywriter.js';
