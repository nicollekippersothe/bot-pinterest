import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config, IMAGES_DIR, PIN_HEIGHT, PIN_WIDTH } from '../config/index.js';
import { measureBorderWhite } from '../miner/image-quality.js';
import { logger } from '../utils/logger.js';
import { slugify } from '../utils/links.js';
import type { OfferRow } from '../database/offers.js';

/** Teto de download para não estourar memória com uma URL hostil. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** A foto ocupa a largura toda e 72% da altura; o resto é a faixa de texto. */
const PHOTO_HEIGHT = Math.round(PIN_HEIGHT * 0.72);
const BANNER_HEIGHT = PIN_HEIGHT - PHOTO_HEIGHT;

/** Acima disso a moldura é branca: foto de catálogo, não pode ser cortada. */
const CATALOG_BORDER_WHITE = 0.5;

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

/** Quebra o título em até duas linhas que cabem na largura do pin. */
export function wrapTitle(title: string, maxChars = 30, maxLines = 2): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  const used = lines.join(' ').length;
  if (lines.length === maxLines && used < title.length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, maxChars - 1)}…`;
  }
  return lines;
}

/**
 * Foto sangrando na largura toda, com corte guiado pela região de maior
 * interesse — chama muito mais atenção no feed do que produto recortado
 * flutuando num fundo desfocado.
 */
async function buildPhotoLayer(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .resize(PIN_WIDTH, PHOTO_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();
}

/**
 * Pin sem faixa de preço e sem texto: só a fotografia.
 *
 * No Pinterest a foto é o anúncio — faixa de preço e selo de desconto fazem o
 * pin parecer anúncio de marketplace, que é justamente o que as pessoas rolam
 * sem ver. O preço não se perde: continua no título e na descrição, que o
 * Pinterest mostra ao lado do pin.
 *
 * O enquadramento depende do tipo de foto, e a moldura branca diz qual é:
 *
 * - **Foto ambientada** (moldura colorida): corta em 2:3 sangrando, guiado pela
 *   região de maior interesse. É o formato que preenche a tela no feed.
 * - **Foto de catálogo** (moldura branca): cortar decapitaria o produto, que
 *   costuma ocupar o quadro inteiro. Entra inteira, centralizada, com margem
 *   sobre um fundo claro tirado da própria imagem.
 */
async function buildCleanPin(source: Buffer): Promise<Buffer> {
  const borderWhite = await measureBorderWhite(sharp(source));

  if (borderWhite <= CATALOG_BORDER_WHITE) {
    return sharp(source)
      .resize(PIN_WIDTH, PIN_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  // Fundo tirado da própria foto: nunca destoa do produto, e o branco puro
  // da Shopee some no feed branco do Pinterest.
  const { dominant } = await sharp(source).stats();
  const background = {
    r: Math.round(dominant.r * 0.12 + 255 * 0.88),
    g: Math.round(dominant.g * 0.12 + 255 * 0.88),
    b: Math.round(dominant.b * 0.12 + 255 * 0.88),
  };

  const inner = Math.round(PIN_WIDTH * 0.86);
  // A foto de catálogo já vem com margem branca própria. Sem aparar, ela soma
  // com a margem do pin e o produto fica pequeno num quadro alto e vazio.
  // `trim` falha em imagem sem borda uniforme — daí o fallback para a original.
  let product: Buffer;
  try {
    product = await sharp(source).trim({ threshold: 12 }).toBuffer();
  } catch {
    product = source;
  }

  product = await sharp(product)
    .resize(inner, Math.round(PIN_HEIGHT * 0.78), { fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  const { width = inner, height = inner } = await sharp(product).metadata();

  return sharp({
    create: { width: PIN_WIDTH, height: PIN_HEIGHT, channels: 3, background },
  })
    .composite([
      {
        input: product,
        left: Math.round((PIN_WIDTH - width) / 2),
        // Levemente acima do centro ótico: o rodapé do pin fica encoberto pelo
        // título que o Pinterest desenha por cima.
        top: Math.round((PIN_HEIGHT - height) / 2 - PIN_HEIGHT * 0.04),
      },
    ])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

/** Faixa inferior: nome do produto, preço original riscado e preço em destaque. */
function buildBannerSvg(offer: OfferRow): Buffer {
  const price = escapeXml(formatBRL(offer.price));
  const original = offer.original_price ? escapeXml(formatBRL(offer.original_price)) : null;
  const discount = offer.discount ?? 0;
  const fontStack = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
  const lines = wrapTitle(offer.pin_title ?? offer.title);

  const badge =
    discount > 0
      ? `<rect x="44" y="44" width="188" height="72" rx="36" fill="#e63946"/>
         <text x="138" y="94" text-anchor="middle" font-family="${fontStack}"
               font-size="38" font-weight="bold" fill="#ffffff">-${discount}%</text>`
      : '';

  const originalMarkup = original
    ? `<text x="50" y="${PHOTO_HEIGHT + 250}" font-family="${fontStack}" font-size="34" fill="#7d95a3">${original}</text>
       <line x1="46" y1="${PHOTO_HEIGHT + 238}" x2="${50 + original.length * 19}" y2="${PHOTO_HEIGHT + 238}"
             stroke="#7d95a3" stroke-width="3"/>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}">
      <rect y="${PHOTO_HEIGHT}" width="${PIN_WIDTH}" height="${BANNER_HEIGHT}" fill="#0d1f2d"/>
      ${badge}
      ${lines
        .map(
          (line, index) =>
            `<text x="50" y="${PHOTO_HEIGHT + 78 + index * 52}" font-family="${fontStack}"
                   font-size="42" font-weight="bold" fill="#ffffff">${escapeXml(line)}</text>`,
        )
        .join('')}
      ${originalMarkup}
      <text x="50" y="${PHOTO_HEIGHT + 350}" font-family="${fontStack}" font-size="96"
            font-weight="bold" fill="#ffd166">${price}</text>
      <text x="${PIN_WIDTH - 50}" y="${PHOTO_HEIGHT + 348}" text-anchor="end"
            font-family="${fontStack}" font-size="30" font-weight="bold" fill="#7fd1b9">na Shopee →</text>
    </svg>`;

  return Buffer.from(svg);
}

/** Monta o pin 1000x1500 (2:3) exigido pelo Pinterest. */
export async function buildPinImage(offer: OfferRow, imageBuffer: Buffer): Promise<PinImageResult> {
  const composed =
    config.pinStyle === 'clean'
      ? await buildCleanPin(imageBuffer)
      : await buildBannerPin(offer, imageBuffer);

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const fileName = `${offer.id}-${slugify(offer.title, 40) || 'pin'}.jpg`;
  const filePath = path.join(IMAGES_DIR, fileName);
  fs.writeFileSync(filePath, composed);

  logger.debug(`Pin gerado em ${filePath}`);
  return { filePath, width: PIN_WIDTH, height: PIN_HEIGHT };
}

/** Formato antigo: foto em cima, faixa escura com preço embaixo. */
async function buildBannerPin(offer: OfferRow, imageBuffer: Buffer): Promise<Buffer> {
  const [background, photo] = await Promise.all([
    buildBackground(imageBuffer),
    buildPhotoLayer(imageBuffer),
  ]);

  return sharp(background)
    .composite([
      { input: photo, top: 0, left: 0 },
      { input: buildBannerSvg(offer), top: 0, left: 0 },
    ])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

/** Baixa a imagem da oferta e gera o pin. Lança se a oferta não tiver imagem. */
export async function generatePin(offer: OfferRow): Promise<PinImageResult> {
  if (!offer.image_url) {
    throw new Error(`oferta ${offer.id} não tem imagem`);
  }
  const buffer = await downloadImage(offer.image_url);
  return buildPinImage(offer, buffer);
}
