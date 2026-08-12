import { logger } from '../utils/logger.js';
import type { MinedOffer } from './types.js';

/**
 * Busca a imagem do produto na própria página da Shopee, lendo a meta tag
 * `og:image`. É a alternativa ao datafeed de 189 MB: o CSV do painel não traz
 * imagem, e sem imagem não existe pin.
 *
 * A Shopee bloqueia IP de datacenter com alguma frequência. Toda falha aqui é
 * apenas registrada — a oferta segue sem imagem e é descartada mais adiante,
 * em vez de derrubar a execução.
 */

const REQUEST_TIMEOUT_MS = 25_000;
/** Pausa entre requisições: sequência agressiva é o que dispara bloqueio. */
const DELAY_BETWEEN_REQUESTS_MS = 1_500;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lê `og:image` tolerando atributos em qualquer ordem. */
export function extractOgImage(html: string): string | null {
  const withPropertyFirst = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
  );
  if (withPropertyFirst) return withPropertyFirst[1];

  const withContentFirst = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  );
  return withContentFirst ? withContentFirst[1] : null;
}

/** Devolve a URL da imagem principal do produto, ou null se não der. */
export async function resolveProductImage(productUrl: string): Promise<string | null> {
  try {
    const response = await fetch(productUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.debug(`página do produto respondeu ${response.status}: ${productUrl}`);
      return null;
    }

    return extractOgImage(await response.text());
  } catch (error) {
    logger.debug(`falha ao ler página do produto: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Completa as ofertas que ainda estão sem imagem depois do datafeed.
 * Requisições em série, com pausa — devagar de propósito.
 */
export async function enrichFromProductPages(offers: MinedOffer[]): Promise<MinedOffer[]> {
  const pending = offers.filter((offer) => !offer.imageUrl && offer.originalUrl);
  if (pending.length === 0) return offers;

  logger.info(`Buscando imagem na página de ${pending.length} produto(s)...`);
  const resolved = new Map<string, string>();

  for (const [index, offer] of pending.entries()) {
    const image = await resolveProductImage(offer.originalUrl);
    if (image) resolved.set(offer.productKey, image);
    if (index < pending.length - 1) await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  logger.info(`Imagens recuperadas da página: ${resolved.size}/${pending.length}`);

  return offers.map((offer) =>
    offer.imageUrl ? offer : { ...offer, imageUrl: resolved.get(offer.productKey) ?? null },
  );
}
