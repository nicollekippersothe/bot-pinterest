import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório (engine/src/config -> engine/src -> engine -> raiz). */
export const ROOT_DIR = path.resolve(here, '..', '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

/** Pastas de trabalho: imagens geradas e sessão do Playwright. */
export const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
export const IMAGES_DIR = path.join(STORAGE_DIR, 'images');
export const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(ROOT_DIR, process.env.DATABASE_PATH)
  : path.join(STORAGE_DIR, 'affiliate.db');
export const PINTEREST_STATE_PATH = path.join(STORAGE_DIR, 'pinterest_state.json');

/** Fonte de mineração: `mock` gera payload simulado, `shopee` tenta a busca real. */
export type MinerSource = 'mock' | 'shopee';

function asInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5',

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    channelId: process.env.TELEGRAM_CHANNEL_ID ?? '',
  },

  pinterest: {
    email: process.env.PINTEREST_EMAIL ?? '',
    password: process.env.PINTEREST_PASSWORD ?? '',
    boardName: process.env.PINTEREST_BOARD_NAME ?? 'Achados da Semana',
  },

  miner: {
    source: (process.env.MINER_SOURCE ?? 'mock') as MinerSource,
    /** Palavras-chave usadas na busca, separadas por vírgula. */
    keywords: (process.env.MINER_KEYWORDS ?? 'organizador de cozinha,utensílios de cozinha,decoração para casa')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    /** Quantidade de ofertas novas buscadas por execução. */
    limit: asInt(process.env.MINER_LIMIT, 10),
    /** Desconto mínimo (%) para uma oferta ser considerada. */
    minDiscount: asInt(process.env.MINER_MIN_DISCOUNT, 10),
  },

  /** ID de afiliado Shopee usado para montar os links de saída. */
  shopeeAffiliateId: process.env.SHOPEE_AFFILIATE_ID ?? 'an_18393280814',

  cronSchedule: process.env.CRON_SCHEDULE ?? '0 */2 * * *',
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

/** Proporção de pin exigida pelo Pinterest (2:3). */
export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;
