/**
 * Publica as ofertas prontas no feed estático (`public/pins/` + `public/feed.json`).
 *
 *   npm run engine:feed        # usa PUBLISH_BATCH_SIZE
 *   npm run engine:feed -- 1   # libera só uma oferta nesta rodada
 *
 * O lote explícito serve para soltar um pin de cada vez quando se quer observar
 * o resultado no Pinterest antes de liberar o resto.
 *
 * Depois faça o deploy (git push, se houver deploy automático na Vercel) para
 * que os pins fiquem acessíveis pela URL pública que o Pinterest vai baixar.
 */
import { closeDb } from '../database/db.js';
import { publishFeed } from '../publisher/feed.js';
import { logger } from '../utils/logger.js';

const requested = Number(process.argv[2]);
const limit = Number.isInteger(requested) && requested > 0 ? requested : undefined;

try {
  const feed = await publishFeed(limit);
  for (const item of feed.slice(0, 5)) {
    logger.info(`• ${item.title}`);
    logger.info(`  ${item.imageUrl}`);
  }
} catch (error) {
  logger.error((error as Error).message);
  process.exitCode = 1;
} finally {
  closeDb();
}
