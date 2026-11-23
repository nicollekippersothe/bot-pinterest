import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_PINS_DIR, STORAGE_DIR } from '../config/index.js';
import { listByStatus, updateOffer, type OfferRow } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { logger } from '../utils/logger.js';
import { buildPinterestDescription, ensurePin } from './feed.js';
import { parseHashtags } from './telegram.js';

/**
 * Gera o arquivo CSV do "Importar conteúdo" do Pinterest (envio em lote).
 *
 * É o caminho oficial que dispensa API e aprovação: você sobe o arquivo em
 * Configurações > Importar conteúdo e o Pinterest agenda os pins pela coluna
 * "Publish date". Formato conforme a central de ajuda do Pinterest:
 *
 *   Title (≤100), Media URL (pública, direto no arquivo), Pinterest board,
 *   Thumbnail (só vídeo), Description (≤500), Link, Publish date, Keywords.
 *
 * Limite informado pelo Pinterest: 200 pins por envio.
 */

export const CSV_HEADER = [
  'Title',
  'Media URL',
  'Pinterest board',
  'Thumbnail',
  'Description',
  'Link',
  'Publish date',
  'Keywords',
] as const;

export const MAX_PINS_PER_FILE = 200;
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Janela de publicação em UTC: 12h-23h30 UTC = 9h-20h30 em Brasília. */
const WINDOW_START_UTC = 12 * HOUR;
const WINDOW_LENGTH = 11.5 * HOUR;

export interface ExportOptions {
  /** Quantos dias o lote cobre. */
  days: number;
  /** Pins por dia. */
  perDay: number;
  /** Primeiro dia da agenda, `AAAA-MM-DD` (UTC). Padrão: amanhã. */
  startDate?: string;
  /** Nome EXATO do quadro no Pinterest. */
  board: string;
  /** Não copia imagens nem marca ofertas; só mostra o resultado. */
  dryRun?: boolean;
  /** Pasta de saída do CSV. */
  outDir?: string;
  /** Fonte de aleatoriedade (injetável para teste). */
  random?: () => number;
}

export interface ExportResult {
  filePath: string;
  count: number;
  requested: number;
  rows: string[][];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `AAAA-MM-DDTHH:MM:SS`, em UTC, no formato aceito pela coluna "Publish date". */
function formatUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Distribui `total` pins em `perDay` por dia, dentro da janela, com variação de minutos. */
export function scheduleTimes(total: number, perDay: number, startDate: string, random: () => number = Math.random): string[] {
  const dayZero = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(dayZero)) throw new Error(`Data inicial inválida: ${startDate}`);

  const out: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const day = Math.floor(i / perDay);
    const slot = i % perDay;
    const inThisDay = Math.min(perDay, total - day * perDay);
    const segment = WINDOW_LENGTH / inThisDay;
    const jitter = Math.min(20 * MINUTE, Math.max(0, (segment - 60 * MINUTE) / 2));
    const offset = WINDOW_START_UTC + (slot + 0.5) * segment + (random() * 2 - 1) * jitter;
    out.push(formatUtc(dayZero + day * 24 * HOUR + Math.round(offset / MINUTE) * MINUTE));
  }
  return out;
}

function csvField(value: string): string {
  const flat = value.replace(/\s*[\r\n]+\s*/g, ' ');
  return /[",]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat;
}

export function toCsv(rows: string[][]): string {
  return [CSV_HEADER.join(','), ...rows.map((row) => row.map(csvField).join(','))].join('\n') + '\n';
}

function keywordsFrom(offer: OfferRow): string {
  const tags = parseHashtags(offer.hashtags)
    .map((tag) => tag.replace(/^#/, '').trim().toLowerCase())
    .filter((tag) => tag && !/^(publi|ad|afiliado|publicidade)$/.test(tag));
  return [...new Set(tags)].slice(0, 5).join(', ');
}

function tomorrowUtc(): string {
  const d = new Date(Date.now() + 24 * HOUR);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export async function exportPinterestCsv(options: ExportOptions): Promise<ExportResult> {
  const { days, perDay, board } = options;
  if (!board.trim()) throw new Error('Informe o nome EXATO do quadro (PINTEREST_BOARD_NAME). Nome diferente cria um quadro novo.');
  if (!config.publicBaseUrl) throw new Error('PUBLIC_BASE_URL não configurada: o Pinterest baixa a imagem dessa URL.');
  if (!(days > 0) || !(perDay > 0)) throw new Error('days e perDay precisam ser maiores que zero.');

  const requested = Math.min(days * perDay, MAX_PINS_PER_FILE);
  if (days * perDay > MAX_PINS_PER_FILE) {
    logger.warn(`O Pinterest aceita ${MAX_PINS_PER_FILE} pins por arquivo; o lote foi limitado de ${days * perDay} para ${requested}.`);
  }

  // Só o que está pronto e ainda não foi para o feed nem para o Pinterest.
  const ready = listByStatus(OFFER_STATUS.PROCESSED, 500).filter((offer) => !offer.feed_at && !offer.pinterest_url);
  const chosen: { offer: OfferRow; fileName: string }[] = [];
  for (const offer of ready) {
    if (chosen.length >= requested) break;
    const pinPath = await ensurePin(offer);
    if (pinPath) chosen.push({ offer, fileName: path.basename(pinPath) });
  }
  if (chosen.length < requested) {
    logger.warn(`Só há ${chosen.length} pin(s) prontos para ${requested} pedidos. Rode a mineração de novo para ter mais.`);
  }

  const times = scheduleTimes(chosen.length, perDay, options.startDate ?? tomorrowUtc(), options.random);
  const base = config.publicBaseUrl.replace(/\/+$/, '');
  const rows = chosen.map(({ offer, fileName }, index) => [
    (offer.pin_title ?? offer.title).slice(0, TITLE_MAX),
    `${base}/pins/${fileName}`,
    board,
    '', // Thumbnail: só para vídeo
    buildPinterestDescription(offer, DESCRIPTION_MAX),
    offer.affiliate_url,
    times[index]!,
    keywordsFrom(offer),
  ]);

  const outDir = options.outDir ?? path.join(STORAGE_DIR, 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const filePath = path.join(outDir, `pinterest-lote-${stamp}.csv`);
  fs.writeFileSync(filePath, toCsv(rows), 'utf8');

  if (!options.dryRun) {
    fs.mkdirSync(PUBLIC_PINS_DIR, { recursive: true });
    const feedAt = new Date().toISOString();
    for (const { offer, fileName } of chosen) {
      const source = offer.pin_image_path;
      if (source && fs.existsSync(source)) fs.copyFileSync(source, path.join(PUBLIC_PINS_DIR, fileName));
      // Marca como entregue para o Make não publicar o mesmo produto de novo.
      updateOffer(offer.id, { feed_at: feedAt });
    }
  }

  logger.success(`CSV do Pinterest: ${rows.length} pin(s) em ${filePath}`);
  return { filePath, count: rows.length, requested, rows };
}
