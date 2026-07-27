import { pathToFileURL } from 'node:url';
import { config } from './config/index.js';
import { closeDb } from './database/db.js';
import { countByStatus, listByStatus } from './database/offers.js';
import { OFFER_STATUS } from './database/schema.js';
import { mineAndStore } from './miner/index.js';
import { processPending } from './processor/index.js';
import { logger } from './utils/logger.js';

/**
 * Orquestrador do pipeline.
 *
 * Fases 1-2 (implementadas): mineração -> deduplicação -> persistência.
 * Fases 3-5 (a implementar): IA/copy -> geração do pin -> Pinterest -> Telegram.
 */
export async function runPipeline(): Promise<void> {
  const started = Date.now();

  const { mined, inserted, duplicates } = await mineAndStore();

  if (inserted.length === 0) {
    logger.info(`Nenhuma oferta nova desta vez (${mined.length} verificadas, ${duplicates} repetidas).`);
  } else {
    for (const offer of inserted) {
      logger.info(
        `+ [${offer.discount}% OFF] ${offer.title} — R$ ${offer.price.toFixed(2)} (${offer.product_key})`,
      );
    }
  }

  const processed = await processPending(config.miner.limit);
  for (const item of processed) {
    logger.info(`✎ ${item.copy.pinTitle} — ${item.copy.hashtags.join(' ')}`);
  }

  const ready = listByStatus(OFFER_STATUS.PROCESSED);
  logger.info(`Prontas para publicação: ${ready.length} oferta(s).`);
  logger.debug('Totais por status:', countByStatus());

  // TODO Fase 4: publicar no Pinterest via Playwright (sessão persistente).
  // TODO Fase 5: publicar no Telegram e marcar as ofertas como postadas.

  logger.success(`Pipeline finalizado em ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function main(): Promise<void> {
  logger.info(`Engine de afiliados iniciada — fonte "${config.miner.source}"`);
  try {
    await runPipeline();
  } finally {
    closeDb();
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  main().catch((error) => {
    logger.error('Falha na execução:', error);
    process.exitCode = 1;
  });
}
