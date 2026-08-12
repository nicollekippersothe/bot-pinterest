/**
 * Baixa o datafeed da Shopee para enriquecer os produtos do painel
 * (imagem em alta, desconto, categoria, avaliação).
 *
 *   npm run engine:datafeed
 *
 * Requer SHOPEE_DATAFEED_URL no .env. Essa URL é CREDENCIAL: quem tiver
 * acesso a ela baixa seus dados. Nunca versione nem compartilhe.
 */
import { downloadDatafeed } from '../miner/datafeed.js';
import { logger } from '../utils/logger.js';

downloadDatafeed().catch((error) => {
  logger.error((error as Error).message);
  process.exitCode = 1;
});
