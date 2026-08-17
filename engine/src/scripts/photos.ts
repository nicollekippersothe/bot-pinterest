/**
 * Reavalia a foto das ofertas que ainda não entraram no feed.
 *
 *   npm run engine:photos           # mostra o que mudaria
 *   npm run engine:photos -- --apply  # grava
 *
 * A escolha da foto acontece na mineração, então uma oferta já gravada nunca
 * reavalia sozinha. Este script existe para aplicar uma melhora de critério —
 * hoje, a seleção por visão — ao que já está no banco, sem esperar um lote novo.
 *
 * Só toca em oferta sem `feed_at`: o que já foi para o feed pode já ter virado
 * pin, e trocar a imagem ali não desfaz o que está publicado.
 */
import fs from 'node:fs';
import { closeDb, getDb } from '../database/db.js';
import { updateOffer, type OfferRow } from '../database/offers.js';
import { resolveProductImage } from '../miner/product-page.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const apply = process.argv.includes('--apply');
const DELAY_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!config.geminiApiKey) {
    logger.warn('GEMINI_API_KEY ausente — a reavaliação usaria a mesma heurística de antes.');
  }

  const pending = getDb()
    .prepare('SELECT * FROM offers WHERE feed_at IS NULL ORDER BY id')
    .all() as OfferRow[];

  if (pending.length === 0) {
    logger.info('Nenhuma oferta na fila para reavaliar.');
    return;
  }

  logger.info(`Reavaliando a foto de ${pending.length} oferta(s)${apply ? '' : ' (simulação)'}...`);
  let changed = 0;

  for (const [index, offer] of pending.entries()) {
    if (!offer.original_url) continue;

    const picked = await resolveProductImage(offer.original_url);
    const title = offer.title.slice(0, 40);

    if (!picked) {
      logger.warn(`${offer.id} sem foto aproveitável | ${title}`);
    } else if (picked === offer.image_url) {
      logger.info(`${offer.id} mantida | ${title}`);
    } else {
      changed += 1;
      logger.success(`${offer.id} TROCADA | ${title}`);
      logger.info(`   antes: ${offer.image_url}`);
      logger.info(`   agora: ${picked}`);

      if (apply) {
        // Sem o arquivo do pin, o publishFeed regenera com a foto nova.
        if (offer.pin_image_path && fs.existsSync(offer.pin_image_path)) {
          fs.unlinkSync(offer.pin_image_path);
        }
        updateOffer(offer.id, { image_url: picked, pin_image_path: null });
      }
    }

    if (index < pending.length - 1) await sleep(DELAY_MS);
  }

  logger.success(
    apply
      ? `${changed}/${pending.length} oferta(s) com foto nova.`
      : `${changed}/${pending.length} mudariam. Rode com --apply para gravar.`,
  );
}

try {
  await main();
} catch (error) {
  logger.error((error as Error).message);
  process.exitCode = 1;
} finally {
  closeDb();
}
