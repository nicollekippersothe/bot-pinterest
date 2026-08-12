import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { IMAGES_DIR, PIN_HEIGHT, PIN_WIDTH } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { slugify } from '../utils/links.js';
import type { OfferRow } from '../database/offers.js';

/** Teto de download para não estourar memória com uma URL hostil. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Margem interna: o produto nunca encosta na borda do pin. */
const PRODUCT_PADDING = 70;
/** Faixa inferior reservada para preço e desconto. */
const BANNER_HEIGHT = 260;

export interface PinImageResult {
  /** Caminho absoluto do arquivo gerado. */
  filePath: string;
  width: number;
  height: number;
}

/** Baixa a imagem do produto validando tipo e tamanho. */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`download falhou com status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`conteúdo não é imagem (${contentType})`);
  }

  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error(`imagem grande demais (${declaredLength} bytes)`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`imagem grande demais (${buffer.byteLength} bytes)`);
  }
  if (buffer.byteLength === 0) {
    throw new Error('imagem vazia');
  }

  return buffer;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Escapa texto que vai para dentro do SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Fundo suave derivado da própria foto: a imagem é ampliada para cobrir o pin,
 * desfocada e clareada. Evita barras brancas duras em produtos quadrados.
 */
async function buildBackground(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .resize(PIN_WIDTH, PIN_HEIGHT, { fit: 'cover', position: 'centre' })
    .blur(45)
    .modulate({ brightness: 1.18, saturation: 0.55 })
    .flatten({ background: '#ffffff' })
    .toBuffer();
}

/**
 * Produto redimensionado para caber inteiro na área útil (`fit: 'contain'`),
 * então nada é cortado — inclusive fotos quadradas, que é o caso da Shopee.
 */
async function buildProductLayer(source: Buffer): Promise<{ buffer: Buffer; height: number }> {
  const boxWidth = PIN_WIDTH - PRODUCT_PADDING * 2;
  const boxHeight = PIN_HEIGHT - BANNER_HEIGHT - PRODUCT_PADDING * 2;

  const buffer = await sharp(source)
    .resize(boxWidth, boxHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  return { buffer, height: boxHeight };
}

/** Faixa inferior com preço, preço original riscado e selo de desconto. */
function buildBannerSvg(offer: OfferRow): Buffer {
  const price = escapeXml(formatBRL(offer.price));
  const original = offer.original_price ? escapeXml(formatBRL(offer.original_price)) : null;
  const discount = offer.discount ?? 0;
  const fontStack = "'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif";

  // Largura aproximada do preço original, para posicionar o risco por cima.
  const originalWidth = original ? original.length * 17 : 0;
  const badge =
    discount > 0
      ? `
      <rect x="${PIN_WIDTH - 260}" y="${BANNER_HEIGHT / 2 - 55}" width="200" height="110" rx="24" fill="#e63946"/>
      <text x="${PIN_WIDTH - 160}" y="${BANNER_HEIGHT / 2 - 4}" text-anchor="middle"
            font-family="${fontStack}" font-size="52" font-weight="bold" fill="#ffffff">${discount}%</text>
      <text x="${PIN_WIDTH - 160}" y="${BANNER_HEIGHT / 2 + 38}" text-anchor="middle"
            font-family="${fontStack}" font-size="28" font-weight="bold" fill="#ffffff">OFF</text>`
      : '';

  const originalMarkup = original
    ? `
      <text x="60" y="${BANNER_HEIGHT / 2 - 44}" font-family="${fontStack}" font-size="34" fill="#8d99ae">${original}</text>
      <line x1="56" y1="${BANNER_HEIGHT / 2 - 55}" x2="${60 + originalWidth}" y2="${BANNER_HEIGHT / 2 - 55}"
            stroke="#8d99ae" stroke-width="3"/>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${BANNER_HEIGHT}">
      <rect width="${PIN_WIDTH}" height="${BANNER_HEIGHT}" fill="#ffffff"/>
      <rect width="${PIN_WIDTH}" height="8" fill="#e63946"/>
      ${originalMarkup}
      <text x="60" y="${BANNER_HEIGHT / 2 + 40}" font-family="${fontStack}" font-size="78"
            font-weight="bold" fill="#1d3557">${price}</text>
      ${badge}
    </svg>`;

  return Buffer.from(svg);
}

/**
 * Monta o pin 1000x1500 (2:3) exigido pelo Pinterest:
 * fundo desfocado + produto inteiro centralizado + faixa de preço.
 */
export async function buildPinImage(offer: OfferRow, imageBuffer: Buffer): Promise<PinImageResult> {
  const [background, product] = await Promise.all([
    buildBackground(imageBuffer),
    buildProductLayer(imageBuffer),
  ]);

  const composed = await sharp(background)
    .composite([
      { input: product.buffer, top: PRODUCT_PADDING, left: PRODUCT_PADDING },
      { input: buildBannerSvg(offer), top: PIN_HEIGHT - BANNER_HEIGHT, left: 0 },
    ])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const fileName = `${offer.id}-${slugify(offer.title, 40) || 'pin'}.jpg`;
  const filePath = path.join(IMAGES_DIR, fileName);
  fs.writeFileSync(filePath, composed);

  logger.debug(`Pin gerado em ${filePath}`);
  return { filePath, width: PIN_WIDTH, height: PIN_HEIGHT };
}

/** Baixa a imagem da oferta e gera o pin. Lança se a oferta não tiver imagem. */
export async function generatePin(offer: OfferRow): Promise<PinImageResult> {
  if (!offer.image_url) {
    throw new Error(`oferta ${offer.id} não tem imagem`);
  }
  const buffer = await downloadImage(offer.image_url);
  return buildPinImage(offer, buffer);
}
