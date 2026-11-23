import { createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { filterNewOffers } from '../database/offers.js';
import { logger } from '../utils/logger.js';
import { enrichFromDatafeed } from './datafeed.js';
import { enrichFromProductPages } from './product-page.js';
import type { MinedOffer, Miner, MinerOptions } from './types.js';

/**
 * Minerador pela API de Afiliados da Shopee (GraphQL).
 *
 * Substitui o CSV gerado à mão no painel: a API devolve produtos com comissão,
 * vendas e nota, e o `offerLink` já é o link rastreado da SUA conta. Assim o
 * estoque não acaba mais quando o lote do painel termina.
 *
 * Credenciais: AFFILIATE_APP_ID e AFFILIATE_SECRET (affiliate.shopee.com.br,
 * seção de API aberta). Nunca versione.
 */

const ENDPOINT = 'https://open-api.affiliate.shopee.com.br/graphql';
const BASE_FIELDS = 'itemId shopId productName price sales ratingStar commissionRate offerLink productLink';

export interface ApiNode {
  itemId: string | number;
  shopId: string | number;
  productName: string;
  price: string | number;
  sales?: string | number | null;
  ratingStar?: string | number | null;
  commissionRate?: string | number | null;
  offerLink?: string | null;
  productLink?: string | null;
  imageUrl?: string | null;
}

/** Quando o campo de imagem não existe na API, desliga e segue sem ele (o datafeed completa). */
let imageFieldAvailable = true;

async function graphql<T>(query: string): Promise<T> {
  const { appId, secret } = config.affiliateApi;
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query });
  const signature = createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`).digest('hex');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || json.errors?.length) {
    throw new Error(`API de afiliados: ${JSON.stringify(json.errors ?? response.status)}`);
  }
  return json.data as T;
}

async function fetchNodes(keyword: string, page: number): Promise<ApiNode[]> {
  const build = (withImage: boolean) =>
    `{ productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: 5, page: ${page}, limit: 40) { nodes { ${BASE_FIELDS}${withImage ? ' imageUrl' : ''} } } }`;

  try {
    const data = await graphql<{ productOfferV2: { nodes: ApiNode[] } }>(build(imageFieldAvailable));
    return data.productOfferV2.nodes ?? [];
  } catch (error) {
    if (imageFieldAvailable && /imageUrl/i.test((error as Error).message)) {
      logger.warn('A API não expõe imageUrl; seguindo sem ele (o datafeed completa a imagem).');
      imageFieldAvailable = false;
      const data = await graphql<{ productOfferV2: { nodes: ApiNode[] } }>(build(false));
      return data.productOfferV2.nodes ?? [];
    }
    throw error;
  }
}

/** Converte um item da API no contrato único do pipeline. Devolve null se faltar o essencial. */
export function mapNode(node: ApiNode): MinedOffer | null {
  const itemId = String(node.itemId ?? '');
  const shopId = String(node.shopId ?? '');
  const price = Number(node.price);
  const title = (node.productName ?? '').trim();
  const offerLink = (node.offerLink ?? '').trim();

  // Sem link rastreado, publicar geraria clique sem comissão.
  if (!itemId || !shopId || !title || !offerLink || !(price > 0)) return null;

  // A API devolve a taxa como fração (0,13); o contrato usa percentual (13).
  const rawRate = Number(node.commissionRate);
  const commissionRate = Number.isFinite(rawRate) && rawRate > 0 ? (rawRate <= 1 ? rawRate * 100 : rawRate) : null;
  const sold = Number(node.sales);
  const rating = Number(node.ratingStar);

  return {
    productKey: `shopee:${shopId}.${itemId}`,
    platform: 'shopee',
    title,
    originalUrl: `https://shopee.com.br/product/${shopId}/${itemId}`,
    affiliateUrl: offerLink,
    imageUrl: node.imageUrl?.trim() || null,
    price,
    originalPrice: null,
    discount: 0,
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    sold: Number.isFinite(sold) && sold > 0 ? sold : null,
    category: null,
    commissionRate,
    commissionValue: commissionRate ? (price * commissionRate) / 100 : null,
    shopName: null,
  };
}

/** Critério mínimo de qualidade: comissão, vendas e nota. */
export function passesFilters(offer: MinedOffer): boolean {
  const { minCommission, minSales, minRating } = config.affiliateApi;
  return (
    (offer.commissionRate ?? 0) >= minCommission &&
    (offer.sold ?? 0) >= minSales &&
    (offer.rating ?? 0) >= minRating
  );
}

function payout(offer: MinedOffer): number {
  return offer.commissionValue ?? 0;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const apiMiner: Miner = {
  name: 'api',

  async mine(options: MinerOptions = {}): Promise<MinedOffer[]> {
    const { appId, secret, pages } = config.affiliateApi;
    if (!appId || !secret) {
      throw new Error('Fonte "api" exige AFFILIATE_APP_ID e AFFILIATE_SECRET.');
    }

    const limit = options.limit ?? 10;
    const keywords = options.keywords?.length ? options.keywords : config.miner.keywords;

    const byKey = new Map<string, MinedOffer>();
    let calls = 0;
    let failures = 0;
    let lastError = '';

    for (const keyword of keywords) {
      for (let page = 1; page <= pages; page++) {
        calls++;
        try {
          for (const node of await fetchNodes(keyword, page)) {
            const offer = mapNode(node);
            if (offer && !byKey.has(offer.productKey)) byKey.set(offer.productKey, offer);
          }
        } catch (error) {
          failures++;
          lastError = (error as Error).message;
          logger.warn(`"${keyword}" página ${page}: ${lastError}`);
        }
        await sleep(300);
      }
    }

    // Se TODAS as chamadas falharam, é problema de credencial ou de API: não pode passar em silêncio.
    if (calls > 0 && failures === calls) {
      throw new Error(`Todas as ${calls} chamadas à API de afiliados falharam. Último erro: ${lastError}`);
    }

    const candidates = [...byKey.values()];
    const good = candidates.filter(passesFilters);
    // Só o que ainda não está no banco: sem isso o topo do ranking é sempre o mesmo.
    const fresh = filterNewOffers(good);
    logger.info(
      `API de afiliados: ${candidates.length} produtos, ${good.length} passam nos filtros, ${fresh.length} inéditos`,
    );

    const shortlist = fresh.sort((a, b) => payout(b) - payout(a)).slice(0, limit * 3);
    const needsImage = shortlist.some((offer) => !offer.imageUrl);
    const enriched = needsImage ? await enrichFromProductPages(await enrichFromDatafeed(shortlist)) : shortlist;

    const withImage = enriched.filter((offer) => offer.imageUrl);
    if (withImage.length < enriched.length) {
      logger.warn(`${enriched.length - withImage.length} produto(s) sem imagem foram pulados.`);
    }
    return withImage.slice(0, limit);
  },
};
