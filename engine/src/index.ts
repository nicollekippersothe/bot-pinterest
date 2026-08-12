import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { config } from './config/index.js';
import { closeDb } from './database/db.js';
import { countByStatus, listByStatus } from './database/offers.js';
import { OFFER_STATUS } from './database/schema.js';
import { mineAndStore } from './miner/index.js';
import { processPending } from './processor/index.js';
import { publishProcessed } from './publisher/index.js';
import { logger } from './utils/logger.js';

/**
 * Orquestrador do pipeline.
 *
 * Fases 1-3, 5 (implementadas): mineração -> deduplicação -> copy/pin -> Telegram.
 * Fase 4 (a implementar): publicação no Pinterest antes de marcar como postada.
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

  // TODO Fase 4: publicar no Pinterest via Playwright (sessão persistente).
  const published = await publishProcessed(config.publishBatchSize);

  const ready = listByStatus(OFFER_STATUS.PROCESSED);
  logger.info(`Publicadas: ${published.length} | ainda na fila: ${ready.length}`);
  logger.debug('Totais por status:', countByStatus());

  logger.success(`Pipeline finalizado em ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** Modo agendado: mantém o processo vivo e roda o pipeline no cron configurado. */
function startScheduler(): void {
  if (!cron.validate(config.cronSchedule)) {
    throw new Error(`CRON_SCHEDULE inválido: "${config.cronSchedule}"`);
  }

  let running = false;

  cron.schedule(config.cronSchedule, async () => {
    // Uma execução longa não pode se sobrepor à próxima.
    if (running) {
      logger.warn('Execução anterior ainda em andamento — ciclo ignorado.');
      return;
    }
    running = true;
    try {
      await runPipeline();
    } catch (error) {
      logger.error('Falha no ciclo agendado:', (error as Error).message);
    } finally {
      running = false;
    }
  });

  logger.success(`Agendador ativo (${config.cronSchedule}). Ctrl+C para encerrar.`);
}

async function main(): Promise<void> {
  const scheduled = process.argv.includes('--cron');
  logger.info(
    `Engine de afiliados iniciada — fonte "${config.miner.source}"${scheduled ? ' (modo agendado)' : ''}`,
  );

  if (scheduled) {
    startScheduler();
    await runPipeline(); // primeira execução imediata
    return; // o cron mantém o processo vivo
  }

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
