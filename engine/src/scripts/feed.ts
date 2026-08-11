/**
 * Publica as ofertas prontas no feed estático (`public/pins/` + `public/feed.json`).
 *
 *   npm run engine:feed
 *
 * Depois faça o deploy (git push, se houver deploy automático na Vercel) para
 * que os pins fiquem acessíveis pela URL pública que o Pinterest vai baixar.
 */
import { closeDb } from '../database/db.js';
import { publishFeed } from '../publisher/feed.js';
import { logger } from '../utils/logger.js';

try {
  const feed = publishFeed();
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
