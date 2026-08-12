import { buildShopeeAffiliateLink, buildProductKey, slugify } from '../utils/links.js';
import { logger } from '../utils/logger.js';
import { calcDiscount, type MinedOffer, type Miner, type MinerOptions } from './types.js';

const SEARCH_ENDPOINT = 'https://shopee.com.br/api/v4/search/search_items';
const IMAGE_CDN = 'https://down-br.img.susercontent.com/file';

/** Preços da API vêm multiplicados por 100_000. */
function fromApiPrice(value: number | undefined | null): number {
  if (!value || value <= 0) return 0;
  return Math.round((value / 100_000) * 100) / 100;
}

interface ShopeeItemBasic {
  itemid: number;
  shopid: number;
  name: string;
  image?: string;
  price?: number;
  price_before_discount?: number;
  item_rating?: { rating_star?: number };
  historical_sold?: number;
  sold?: number;
}

/** Converte um item cru da API da Shopee no formato normalizado do pipeline. */
export function normalizeShopeeItem(item: ShopeeItemBasic, category?: string): MinedOffer | null {
  if (!item?.itemid || !item?.shopid || !item?.name) return null;

  const price = fromApiPrice(item.price);
  if (price <= 0) return null;

  const originalPriceRaw = fromApiPrice(item.price_before_discount);
  const originalPrice = originalPriceRaw > price ? originalPriceRaw : null;
  const slug = slugify(item.name);
  const originalUrl = `https://shopee.com.br/${slug}-i.${item.shopid}.${item.itemid}`;

  return {
    productKey: buildProductKey('shopee', originalUrl),
    platform: 'shopee',
    title: item.name,
    originalUrl,
    affiliateUrl: buildShopeeAffiliateLink(String(item.shopid), String(item.itemid), slug),
    imageUrl: item.image ? `${IMAGE_CDN}/${item.image}` : null,
    price,
    originalPrice,
    discount: calcDiscount(originalPrice, price),
    rating: item.item_rating?.rating_star ? Math.round(item.item_rating.rating_star * 10) / 10 : null,
    sold: item.historical_sold ?? item.sold ?? null,
    category: category ?? null,
  };
}

async function searchKeyword(keyword: string, limit: number): Promise<MinedOffer[]> {
  const url =
    `${SEARCH_ENDPOINT}?by=relevancy&keyword=${encodeURIComponent(keyword)}` +
    `&limit=${limit}&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      Referer: `https://shopee.com.br/search?keyword=${encodeURIComponent(keyword)}`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Shopee respondeu ${response.status} para "${keyword}"`);
  }

  const payload = (await response.json()) as { items?: { item_basic?: ShopeeItemBasic }[] };
  const items = payload.items ?? [];

  return items
    .map((entry) => (entry.item_basic ? normalizeShopeeItem(entry.item_basic, keyword) : null))
    .filter((offer): offer is MinedOffer => offer !== null);
}

/**
 * Minerador real da Shopee.
 *
 * A Shopee bloqueia requisições vindas de datacenter/CI com frequência — quando
 * isso acontece o erro é registrado e a palavra-chave é pulada, sem derrubar a
 * execução. Para desenvolvimento use `MINER_SOURCE=mock`.
 */
export const shopeeMiner: Miner = {
  name: 'shopee',

  async mine(options: MinerOptions = {}): Promise<MinedOffer[]> {
    const keywords = options.keywords?.length ? options.keywords : ['achadinhos'];
    const limit = options.limit ?? 10;
    const minDiscount = options.minDiscount ?? 0;
    const perKeyword = Math.max(5, Math.ceil(limit / keywords.length));

    const collected = new Map<string, MinedOffer>();

    for (const keyword of keywords) {
      try {
        const offers = await searchKeyword(keyword, perKeyword);
        for (const offer of offers) {
          if (!collected.has(offer.productKey)) collected.set(offer.productKey, offer);
        }
        logger.debug(`shopee: "${keyword}" -> ${offers.length} itens`);
      } catch (error) {
        logger.warn(`shopee: falha ao buscar "${keyword}":`, (error as Error).message);
      }
    }

    return [...collected.values()]
      .filter((offer) => (offer.discount ?? 0) >= minDiscount)
      .sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0))
      .slice(0, limit);
  },
};
