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
/** CSVs exportados do painel de afiliados ("Obter Link em Massa"). */
export const PANEL_LINKS_DIR = path.join(STORAGE_DIR, 'links');
export const DATAFEED_PATH = path.join(STORAGE_DIR, 'datafeed.csv');
/** `public/` é copiado para `dist/` pelo Vite e servido pela Vercel. */
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const PUBLIC_PINS_DIR = path.join(PUBLIC_DIR, 'pins');

/**
 * Fonte de mineração:
 * - `panel`  — CSVs do painel de afiliados (ÚNICA com link que gera comissão)
 * - `mock`   — payload simulado, sem rede
 * - `shopee` — busca pública; links NÃO rastreiam comissão
 */
export type MinerSource = 'mock' | 'shopee' | 'panel';

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

  /** ID de afiliado Shopee (usado só pela fonte `shopee`, que não rastreia). */
  shopeeAffiliateId: process.env.SHOPEE_AFFILIATE_ID ?? 'an_18393280814',

  /** Pasta com os CSVs exportados do painel de afiliados. */
  panelLinksDir: process.env.PANEL_LINKS_DIR
    ? path.resolve(ROOT_DIR, process.env.PANEL_LINKS_DIR)
    : PANEL_LINKS_DIR,
  /** Cópia local do datafeed, usada só para enriquecer (imagem, desconto). */
  datafeedPath: process.env.DATAFEED_PATH
    ? path.resolve(ROOT_DIR, process.env.DATAFEED_PATH)
    : DATAFEED_PATH,
  /** URL tokenizada do datafeed — é CREDENCIAL, mantenha fora do repositório. */
  datafeedUrl: process.env.SHOPEE_DATAFEED_URL ?? '',

  /** Domínio público onde os pins ficam acessíveis (deploy da Vercel). */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),

  /**
   * Qual foto da galeria vira o pin (0 = foto de catálogo, 1 = segunda).
   * A segunda costuma mostrar o produto ambientado, que converte melhor.
   */
  productImageIndex: asInt(process.env.PRODUCT_IMAGE_INDEX, 1),

  /**
   * Quantos itens o feed mantém.
   *
   * O Make consulta o Data Store uma vez por item, em toda execução — mesmo
   * quando nada mudou. A janela é multiplicador direto de custo: com 30 itens
   * e 3 execuções por dia são 90 operações diárias só para reconfirmar o que
   * já foi publicado, e o plano Free do Make dá ~33 por dia.
   *
   * Duas vezes o lote basta: cobre um ciclo mais a folga de um atraso do Make.
   * Quem garante que nada é republicado é o Data Store, não o tamanho daqui.
   */
  feedMaxItems: asInt(process.env.FEED_MAX_ITEMS, 6),

  /** Quantas ofertas publicar por ciclo — cadência conservadora evita bloqueio. */
  publishBatchSize: asInt(process.env.PUBLISH_BATCH_SIZE, 3),

  cronSchedule: process.env.CRON_SCHEDULE ?? '0 */2 * * *',
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

/** Proporção de pin exigida pelo Pinterest (2:3). */
export const PIN_WIDTH = 1000;
export const PIN_HEIGHT = 1500;
