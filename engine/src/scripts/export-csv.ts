/**
 * Gera o CSV de envio em lote do Pinterest.
 *
 * Uso:
 *   npm run engine:csv -- --dias 14 --por-dia 3 [--inicio 2026-12-01] [--dry]
 *
 * Exige PINTEREST_BOARD_NAME (nome exato do quadro) e PUBLIC_BASE_URL.
 */
import { closeDb } from '../database/db.js';
import { exportPinterestCsv } from '../publisher/pinterest-csv.js';
import { logger } from '../utils/logger.js';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  try {
    const result = await exportPinterestCsv({
      days: Number(arg('dias', '14')),
      perDay: Number(arg('por-dia', '3')),
      startDate: arg('inicio'),
      board: process.env.PINTEREST_BOARD_NAME ?? '',
      dryRun: process.argv.includes('--dry'),
    });
    logger.info(`Arquivo: ${result.filePath} (${result.count}/${result.requested} pins)`);
  } finally {
    closeDb();
  }
}

main().catch((error) => {
  logger.error('Falha ao gerar o CSV:', (error as Error).message);
  process.exitCode = 1;
});
