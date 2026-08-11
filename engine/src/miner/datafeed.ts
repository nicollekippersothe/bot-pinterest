import fs from 'node:fs';
import readline from 'node:readline';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { parseCsv, parseNumber } from '../utils/csv.js';
import { calcDiscount, type MinedOffer } from './types.js';

/**
 * O datafeed da Shopee tem ~189 MB e 2,8 milhões de linhas, então ele é lido
 * em streaming: percorremos o arquivo uma vez procurando apenas os `itemid`
 * que interessam, sem nunca carregar tudo em memória.
 *
 * Serve só para ENRIQUECER (imagem, desconto, categoria, avaliação).
 * O link de afiliado continua vindo do CSV do painel — os links do datafeed
 * não carregam identificador e não geram comissão.
 */

interface FeedRow {
  imageUrl: string | null;
  originalPrice: number | null;
  salePrice: number | null;
  discount: number;
  rating: number | null;
  category: string | null;
}

function itemIdOf(offer: MinedOffer): string | null {
  const match = offer.productKey.match(/(?:\.|item\.)(\d+)$/);
  return match ? match[1] : null;
}

/** Índice das colunas que interessam, a partir do cabeçalho do feed. */
function indexHeader(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, index) => {
    map[name.trim().toLowerCase()] = index;
  });
  return map;
}

function rowToFeedRow(cells: string[], cols: Record<string, number>): FeedRow {
  const at = (key: string): string => cells[cols[key]] ?? '';

  const salePrice = parseNumber(at('sale_price')) || null;
  const originalPrice = parseNumber(at('price')) || null;
  const declared = Number.parseFloat(at('discount_percentage'));
  const rating = Number.parseFloat(at('item_rating'));

  const category =
    at('global_category3') || at('global_category2') || at('global_category1') || '';

  return {
    imageUrl: at('image_link') || null,
    originalPrice,
    salePrice,
    discount: Number.isFinite(declared)
      ? Math.round(declared)
      : calcDiscount(originalPrice, salePrice ?? 0),
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : null,
    category: category || null,
  };
}

/**
 * Varre o datafeed uma única vez e devolve as ofertas completadas.
 * Se o arquivo não existir, devolve as ofertas inalteradas (sem quebrar).
 */
export async function enrichFromDatafeed(
  offers: MinedOffer[],
  feedPath = config.datafeedPath,
): Promise<MinedOffer[]> {
  if (!fs.existsSync(feedPath)) {
    logger.warn(`Datafeed não encontrado em ${feedPath} — ofertas ficam sem imagem.`);
    logger.warn('Baixe com: npm run engine:datafeed');
    return offers;
  }

  const wanted = new Map<string, MinedOffer>();
  for (const offer of offers) {
    const id = itemIdOf(offer);
    if (id) wanted.set(id, offer);
  }
  if (wanted.size === 0) return offers;

  const found = new Map<string, FeedRow>();
  const stream = readline.createInterface({
    input: fs.createReadStream(feedPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let cols: Record<string, number> | null = null;
  let itemIdCol = -1;
  let scanned = 0;

  for await (const line of stream) {
    if (cols === null) {
      cols = indexHeader(parseCsv(line)[0] ?? []);
      itemIdCol = cols['itemid'] ?? -1;
      if (itemIdCol < 0) {
        logger.error('Datafeed sem coluna itemid — formato inesperado.');
        break;
      }
      continue;
    }

    scanned += 1;

    // Filtro barato antes de pagar o custo do parser de CSV.
    let matched: string | null = null;
    for (const id of wanted.keys()) {
      if (!found.has(id) && line.includes(id)) {
        matched = id;
        break;
      }
    }
    if (!matched) continue;

    const cells = parseCsv(line)[0] ?? [];
    const id = (cells[itemIdCol] ?? '').trim();
    if (!wanted.has(id) || found.has(id)) continue;

    found.set(id, rowToFeedRow(cells, cols));
    if (found.size === wanted.size) break; // achou todos, não precisa ler o resto
  }

  stream.close();
  logger.info(`Datafeed: ${found.size}/${wanted.size} produto(s) enriquecidos (${scanned} linhas lidas)`);

  return offers.map((offer) => {
    const id = itemIdOf(offer);
    const row = id ? found.get(id) : undefined;
    if (!row) return offer;

    // O preço do painel é o que vale (é o que a pessoa paga hoje).
    const price = offer.price || row.salePrice || 0;
    const originalPrice = row.originalPrice && row.originalPrice > price ? row.originalPrice : null;

    return {
      ...offer,
      imageUrl: offer.imageUrl ?? row.imageUrl,
      originalPrice,
      discount: originalPrice ? calcDiscount(originalPrice, price) : row.discount,
      rating: offer.rating ?? row.rating,
      category: offer.category ?? row.category,
    };
  });
}

/** Baixa o datafeed (URL tokenizada do painel — trate como credencial). */
export async function downloadDatafeed(
  url = config.datafeedUrl,
  destination = config.datafeedPath,
): Promise<string> {
  if (!url) {
    throw new Error('SHOPEE_DATAFEED_URL não configurada no .env');
  }

  logger.info('Baixando datafeed da Shopee (pode passar de 150 MB)...');
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) {
    throw new Error(`download falhou com status ${response.status}`);
  }

  fs.mkdirSync(new URL('.', `file://${destination}`).pathname, { recursive: true });
  const file = fs.createWriteStream(destination);

  const reader = response.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    file.write(value);
  }
  file.end();

  logger.success(`Datafeed salvo em ${destination} (${(bytes / 1024 / 1024).toFixed(0)} MB)`);
  return destination;
}
