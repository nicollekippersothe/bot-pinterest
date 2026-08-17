import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { pickUsableImage } from './image-quality.js';
import { pickPhotoWithVision } from './photo-vision.js';
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

const IMAGE_HOST = 'https://down-br.img.susercontent.com/file';
/** IDs de foto de produto: `br-11134207-7r98o-...`. Ícones do site não batem. */
const PRODUCT_IMAGE_ID = /^[a-z]{2}-\d+-/i;

/**
 * Extrai a galeria de fotos na ordem em que o vendedor a montou.
 *
 * A primeira costuma ser a foto de catálogo (fundo branco); as seguintes
 * costumam mostrar o produto ambientado, que é o que faz o pin converter no
 * Pinterest. Variantes de baixa resolução (`_tn`, `_cover`) são descartadas.
 */
export function extractGalleryImages(html: string): string[] {
  const seen = new Set<string>();
  const gallery: string[] = [];

  for (const match of html.matchAll(
    /https:\/\/down-br\.img\.susercontent\.com\/file\/([a-z0-9_-]+)/gi,
  )) {
    const id = match[1];
    if (/_(tn|cover|thumb)/i.test(id)) continue;
    if (!PRODUCT_IMAGE_ID.test(id)) continue;
    if (seen.has(id)) continue;

    seen.add(id);
    gallery.push(`${IMAGE_HOST}/${id}`);
  }

  return gallery;
}

/** Baixa uma imagem para avaliação de qualidade. */
async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
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

    const html = await response.text();

    // Preferimos a galeria (dá acesso à foto ambientada); og:image é o
    // fallback, já que sempre existe mesmo quando a galeria não é detectada.
    const gallery = extractGalleryImages(html);
    if (gallery.length === 0) return extractOgImage(html);

    // A visão acha a foto ambientada, que é o que faz o pin converter. Sem
    // chave ou com qualquer falha, cai na heurística — que só sabe descartar
    // rótulo e código de barras.
    const chosen = await pickPhotoWithVision(gallery, fetchImage);
    if (chosen) return chosen;

    return pickUsableImage(gallery, config.productImageIndex, fetchImage);
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
