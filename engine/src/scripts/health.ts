/**
 * Verifica se o motor está de fato produzindo pins e avisa pelo Telegram quando não está.
 *
 * Existe porque a falha anterior foi silenciosa: o pipeline rodou todo dia por quase
 * 7 semanas sem publicar nenhum pin novo, e ninguém foi avisado.
 *
 * Como avisa: a execução FALHA (X vermelho no GitHub Actions), e o GitHub manda e-mail
 * de workflow com falha. Não precisa de Telegram. Se ALERT_TELEGRAM_* existirem, também
 * avisa por lá. Para só registrar no log: HEALTH_FAIL_ON_PROBLEM=false.
 *
 * Uso:
 *   npm run engine:health               verifica estoque e ritmo
 *   npm run engine:health -- --falhou   avisa que a execução do GitHub Actions falhou
 */
import { closeDb, getDb } from '../database/db.js';
import { sendAlert } from '../utils/alert.js';
import { logger } from '../utils/logger.js';

const DAY = 86_400_000;

export interface HealthReport {
  lastFeedAt: string | null;
  daysSinceLastPin: number | null;
  queued: number;
  problems: string[];
}

/** Calcula o relatório a partir do banco. Separado para poder ser testado. */
export function buildReport(now = Date.now(), maxDays = Number(process.env.HEALTH_MAX_DAYS ?? 2)): HealthReport {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(feed_at) AS last_feed,
              SUM(CASE WHEN status = 'processed' AND feed_at IS NULL THEN 1 ELSE 0 END) AS queued
         FROM offers`,
    )
    .get() as { last_feed: string | null; queued: number | null };

  const lastFeedAt = row.last_feed;
  const daysSince = lastFeedAt ? (now - Date.parse(lastFeedAt)) / DAY : null;
  const queued = row.queued ?? 0;

  const problems: string[] = [];
  if (daysSince === null) problems.push('Nenhum pin chegou ao feed até hoje.');
  else if (daysSince > maxDays) problems.push(`Nenhum pin novo há ${Math.floor(daysSince)} dias.`);
  if (queued === 0) problems.push('Não há ofertas prontas esperando na fila.');

  return { lastFeedAt, daysSinceLastPin: daysSince, queued, problems };
}

async function main(): Promise<void> {
  const runUrl =
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : '';

  if (process.argv.includes('--falhou')) {
    await sendAlert(`⚠️ O motor de pins falhou nesta execução.${runUrl ? `\nDetalhes: ${runUrl}` : ''}`);
    return;
  }

  try {
    const report = buildReport();
    logger.info(
      `Saúde: último pin no feed ${report.lastFeedAt ?? 'nunca'} | fila ${report.queued} | problemas: ${report.problems.length}`,
    );
    if (report.problems.length > 0) {
      await sendAlert(`⚠️ Motor de pins com problema:\n- ${report.problems.join('\n- ')}${runUrl ? `\n${runUrl}` : ''}`);
      logger.error(`Motor de pins com problema: ${report.problems.join(' ')}`);
      if (process.env.HEALTH_FAIL_ON_PROBLEM !== 'false') process.exitCode = 1;
    }
  } finally {
    closeDb();
  }
}

// Só executa como script; importar para teste não dispara nada.
if (process.argv[1] && /health\.[tj]s$/.test(process.argv[1])) {
  main().catch((error) => {
    logger.error('Falha na checagem de saúde:', error);
    process.exitCode = 1;
  });
}
