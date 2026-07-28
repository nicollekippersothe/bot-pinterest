import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { OfferRow } from '../database/offers.js';

const API_BASE = 'https://api.telegram.org';
/** Limite de legenda de foto imposto pelo Telegram. */
const CAPTION_MAX = 1024;
const REQUEST_TIMEOUT_MS = 60_000;

export interface TelegramPostResult {
  messageId: string;
  chatId: string;
}

export function isTelegramConfigured(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.channelId);
}

/** Escapa os caracteres que o parse_mode HTML do Telegram interpreta. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Monta a legenda em HTML: chamada da IA, bloco de preço e hashtags.
 * O link não entra aqui — vai no botão de compra, que converte melhor.
 */
export function buildCaption(offer: OfferRow): string {
  const blocks: string[] = [];

  const headline = offer.telegram_caption?.trim() || offer.pin_title?.trim() || offer.title;
  blocks.push(escapeHtml(headline));

  const priceLine = offer.original_price
    ? `De <s>${formatBRL(offer.original_price)}</s> por <b>${formatBRL(offer.price)}</b>`
    : `<b>${formatBRL(offer.price)}</b>`;
  const discount = offer.discount ? ` 🔥 <b>${offer.discount}% OFF</b>` : '';
  blocks.push(`${priceLine}${discount}`);

  const hashtags = parseHashtags(offer.hashtags);
  if (hashtags.length > 0) blocks.push(escapeHtml(hashtags.slice(0, 6).join(' ')));

  const caption = blocks.join('\n\n');
  if (caption.length <= CAPTION_MAX) return caption;

  // Estoura o limite: corta a chamada, preservando preço e hashtags.
  const tail = blocks.slice(1).join('\n\n');
  const room = CAPTION_MAX - tail.length - 4;
  return `${escapeHtml(headline).slice(0, Math.max(room, 0)).trimEnd()}…\n\n${tail}`;
}

/** Lê as hashtags gravadas em JSON, tolerando registros antigos ou inválidos. */
export function parseHashtags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

async function callApi(method: string, body: FormData): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/bot${config.telegram.botToken}/${method}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const payload = (await response.json()) as {
    ok: boolean;
    result?: Record<string, unknown>;
    description?: string;
    error_code?: number;
  };

  if (!payload.ok) {
    throw new Error(`Telegram ${method} falhou (${payload.error_code}): ${payload.description}`);
  }
  return payload.result ?? {};
}

/**
 * Publica a foto do pin no canal com legenda e botão de compra.
 * Requer que o bot seja administrador do canal.
 */
export async function publishToTelegram(offer: OfferRow): Promise<TelegramPostResult> {
  if (!isTelegramConfigured()) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID ausente no .env');
  }
  if (!offer.pin_image_path || !fs.existsSync(offer.pin_image_path)) {
    throw new Error(`imagem do pin não encontrada para a oferta ${offer.id}`);
  }

  const form = new FormData();
  form.append('chat_id', config.telegram.channelId);
  form.append('caption', buildCaption(offer));
  form.append('parse_mode', 'HTML');
  form.append(
    'reply_markup',
    JSON.stringify({
      inline_keyboard: [[{ text: '🛒 Ver oferta na Shopee', url: offer.affiliate_url }]],
    }),
  );

  const image = new Blob([fs.readFileSync(offer.pin_image_path) as unknown as ArrayBuffer], {
    type: 'image/jpeg',
  });
  form.append('photo', image, path.basename(offer.pin_image_path));

  const result = await callApi('sendPhoto', form);
  const messageId = String(result.message_id ?? '');

  logger.success(`Telegram: "${offer.title}" publicado (mensagem ${messageId})`);
  return { messageId, chatId: config.telegram.channelId };
}

/** Confere token e acesso ao canal antes de tentar publicar em lote. */
export async function checkTelegramAccess(): Promise<{ botName: string; chatTitle: string }> {
  if (!isTelegramConfigured()) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID ausente no .env');
  }

  const me = await callApi('getMe', new FormData());

  const chatForm = new FormData();
  chatForm.append('chat_id', config.telegram.channelId);
  const chat = await callApi('getChat', chatForm);

  return {
    botName: String(me.username ?? 'desconhecido'),
    chatTitle: String(chat.title ?? config.telegram.channelId),
  };
}
