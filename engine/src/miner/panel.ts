import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { parseBRNumber, parseCsvRecords, parsePercent, parseSales } from '../utils/csv.js';
import { buildProductKey, parseShopeeUrl, slugify } from '../utils/links.js';
import { enrichFromDatafeed } from './datafeed.js';
import type { MinedOffer, Miner, MinerOptions } from './types.js';

/**
 * Importa os CSVs gerados pelo painel de afiliados ("Obter Link em Massa").
 *
 * Esta é a única fonte cujos links **realmente rastreiam comissão** — a coluna
 * `Offer Link` traz o link curto emitido para a sua conta. O datafeed público
 * não serve para isso: os links dele não carregam identificador de afiliado.
 *
 * Cabeçalho esperado:
 *   Item Id, Item Name, Price, Sales, Nome da loja,
 *   Commission Rate, Commission, Product Link, Offer Link
 */

/** Aceita variações de acento/idioma no cabeçalho do export. */
function pick(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found && record[found]) return record[found];
  }
  return '';
}

export function parsePanelCsv(text: string): MinedOffer[] {
  const offers: MinedOffer[] = [];

  for (const record of parseCsvRecords(text)) {
    const offerLink = pick(record, 'Offer Link', 'Link da Oferta');
    const productLink = pick(record, 'Product Link', 'Link do Produto');
    const title = pick(record, 'Item Name', 'Nome do Item');
    const itemId = pick(record, 'Item Id', 'Item ID');

    // Sem link rastreado a linha é inútil: publicar geraria clique sem comissão.
    if (!offerLink || !title) continue;

    const price = parseBRNumber(pick(record, 'Price', 'Preço'));
    if (price <= 0) continue;

    const parsed = parseShopeeUrl(productLink);
    const productKey = parsed
      ? `shopee:${parsed.shopId}.${parsed.itemId}`
      : itemId
        ? `shopee:item.${itemId}`
        : buildProductKey('shopee', offerLink);

    offers.push({
      productKey,
      platform: 'shopee',
      title,
      originalUrl: productLink || offerLink,
      affiliateUrl: offerLink,
      imageUrl: null, // preenchido pelo datafeed
      price,
      originalPrice: null,
      discount: 0,
      rating: null,
      sold: parseSales(pick(record, 'Sales', 'Vendas')) || null,
      category: null,
      commissionRate: parsePercent(pick(record, 'Commission Rate', 'Taxa de Comissão')) || null,
      commissionValue: parseBRNumber(pick(record, 'Commission', 'Comissão')) || null,
      shopName: pick(record, 'Nome da loja', 'Shop Name') || null,
    });
  }

  return offers;
}

/** Lê todos os `.csv` da pasta de links (um por lote exportado do painel). */
export function loadPanelOffers(dir = config.panelLinksDir): MinedOffer[] {
  if (!fs.existsSync(dir)) {
    logger.warn(`Pasta de links não encontrada: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    logger.warn(`Nenhum CSV em ${dir}. Exporte os links no painel e salve ali.`);
    return [];
  }

  const byKey = new Map<string, MinedOffer>();
  for (const file of files) {
    const parsed = parsePanelCsv(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const offer of parsed) {
      if (!byKey.has(offer.productKey)) byKey.set(offer.productKey, offer);
    }
    logger.debug(`${file}: ${parsed.length} produto(s)`);
  }

  logger.info(`Links do painel: ${byKey.size} produto(s) únicos em ${files.length} arquivo(s)`);
  return [...byKey.values()];
}

/**
 * Minerador do painel: links rastreados do CSV + dados ricos do datafeed.
 * Ordena por comissão estimada, não só por desconto — é o que paga.
 */
export const panelMiner: Miner = {
  name: 'panel',

  async mine(options: MinerOptions = {}): Promise<MinedOffer[]> {
    const limit = options.limit ?? 10;
    const offers = loadPanelOffers();
    if (offers.length === 0) return [];

    const enriched = await enrichFromDatafeed(offers);

    const withImage = enriched.filter((offer) => offer.imageUrl);
    const skipped = enriched.length - withImage.length;
    if (skipped > 0) {
      logger.warn(`${skipped} produto(s) sem imagem no datafeed — não podem virar pin, foram pulados.`);
    }

    return withImage
      .filter((offer) => (offer.discount ?? 0) >= (options.minDiscount ?? 0))
      .sort((a, b) => estimatedPayout(b) - estimatedPayout(a))
      .slice(0, limit);
  },
};

/** Comissão em reais, usada para priorizar o que vale mais divulgar. */
function estimatedPayout(offer: MinedOffer): number {
  if (offer.commissionValue) return offer.commissionValue;
  if (offer.commissionRate) return (offer.price * offer.commissionRate) / 100;
  return 0;
}

export { slugify };
