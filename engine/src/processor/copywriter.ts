import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { OfferRow } from '../database/offers.js';

/** Limites reais do Pinterest — o modelo é instruído a respeitá-los. */
export const PIN_TITLE_MAX = 100;
export const PIN_DESCRIPTION_MAX = 500;

export interface GeneratedCopy {
  /** Título com gatilho mental, até 100 caracteres. */
  pinTitle: string;
  /** Descrição focada em conversão e SEO, até 500 caracteres. */
  pinDescription: string;
  /** Hashtags já normalizadas com "#". */
  hashtags: string[];
  /** Legenda pronta para o Telegram (aceita emoji e quebras de linha). */
  telegramCaption: string;
  /** `claude` quando veio do modelo, `template` quando foi o fallback local. */
  source: 'claude' | 'template';
}

const COPY_SCHEMA = {
  type: 'object',
  properties: {
    pinTitle: {
      type: 'string',
      description: `Título do pin em português do Brasil, com gatilho mental, máximo ${PIN_TITLE_MAX} caracteres. Sem aspas.`,
    },
    pinDescription: {
      type: 'string',
      description: `Descrição do pin em português do Brasil, focada em conversão e otimizada para busca, máximo ${PIN_DESCRIPTION_MAX} caracteres. Sem hashtags aqui.`,
    },
    hashtags: {
      type: 'array',
      description: 'Entre 4 e 8 hashtags relevantes em português, cada uma começando com #, sem espaços.',
      items: { type: 'string' },
    },
    telegramCaption: {
      type: 'string',
      description:
        'Chamada curta para canal de achadinhos no Telegram, com emojis e call to action. Máximo 400 caracteres. NÃO inclua preço nem link: o bot adiciona o bloco de preço e o botão de compra automaticamente.',
    },
  },
  required: ['pinTitle', 'pinDescription', 'hashtags', 'telegramCaption'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  'Você é um copywriter brasileiro especialista em marketing de afiliados para Pinterest e Telegram.',
  'Escreve em português do Brasil, com linguagem simples, direta e honesta.',
  '',
  'Regras:',
  '- Use gatilhos mentais reais da oferta (desconto, escassez de preço, utilidade no dia a dia).',
  '- Nunca invente características, medidas, materiais ou benefícios que não estejam nos dados fornecidos.',
  '- Nunca invente prazos, garantias, estoque restante ou avaliações.',
  '- Nada de CAIXA ALTA em excesso, nem promessas exageradas do tipo "o melhor do mundo".',
  '- Respeite os limites de caracteres informados no schema.',
].join('\n');

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Descreve a oferta para o modelo apenas com dados que existem de fato. */
function buildUserPrompt(offer: OfferRow): string {
  const lines = [
    `Produto: ${offer.title}`,
    `Plataforma: ${offer.platform}`,
    `Preço com desconto: ${formatBRL(offer.price)}`,
  ];
  if (offer.original_price) lines.push(`Preço original: ${formatBRL(offer.original_price)}`);
  if (offer.discount) lines.push(`Desconto: ${offer.discount}%`);
  if (offer.category) lines.push(`Categoria: ${offer.category}`);
  if (offer.rating) lines.push(`Avaliação: ${offer.rating} de 5`);
  if (offer.sold) lines.push(`Unidades vendidas: ${offer.sold}`);

  lines.push('', 'Gere a copy para divulgar esta oferta.');
  return lines.join('\n');
}

/** Garante "#", remove espaços e acentos problemáticos, e descarta duplicatas. */
function normalizeHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw
      .trim()
      .replace(/\s+/g, '')
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_]/gu, '');
    if (!cleaned) continue;

    const tag = `#${cleaned}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }

  return result.slice(0, 8);
}

function truncate(value: string, max: number): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  // Corta na última palavra inteira que couber, deixando espaço para o "…".
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Copy determinística, sem rede. Usada quando não há `ANTHROPIC_API_KEY`,
 * quando a chamada falha e quando o modelo recusa a geração — o pipeline
 * nunca trava por causa da IA.
 */
export function buildFallbackCopy(offer: OfferRow): GeneratedCopy {
  const price = formatBRL(offer.price);
  const discountTag = offer.discount ? `${offer.discount}% OFF` : 'Oferta';
  const category = offer.category ?? 'Achadinhos';

  const pinTitle = truncate(`${offer.title} por ${price} (${discountTag})`, PIN_TITLE_MAX);

  const descriptionParts = [
    `${offer.title} sai por ${price} na ${offer.platform === 'shopee' ? 'Shopee' : offer.platform}.`,
  ];
  if (offer.original_price) {
    descriptionParts.push(`De ${formatBRL(offer.original_price)} por ${price}.`);
  }
  descriptionParts.push(`Ideal para quem procura ${category.toLowerCase()} com bom custo-benefício.`);
  descriptionParts.push('Confira a oferta antes que o preço mude.');

  const hashtags = normalizeHashtags([
    '#achadinhos',
    '#promocao',
    `#${offer.platform}`,
    `#${category}`,
    '#ofertadodia',
    '#economia',
  ]);

  // Sem preço e sem link: o publisher monta o bloco de preço e o botão de compra.
  const telegramCaption = [
    `🔥 ${discountTag} — ${offer.title}`,
    '',
    '🛒 Corre que o preço pode mudar a qualquer momento!',
  ].join('\n');

  return {
    pinTitle,
    pinDescription: truncate(descriptionParts.join(' '), PIN_DESCRIPTION_MAX),
    hashtags,
    telegramCaption,
    source: 'template',
  };
}

/**
 * Gera a copy com o Claude, usando structured outputs para garantir o formato.
 *
 * Qualquer falha (sem chave, erro de rede, recusa do modelo, JSON inesperado)
 * cai no template local — a Fase 3 nunca interrompe o pipeline.
 */
export async function generateCopy(offer: OfferRow): Promise<GeneratedCopy> {
  if (!config.anthropicApiKey) {
    logger.debug('ANTHROPIC_API_KEY ausente — usando copy de template');
    return buildFallbackCopy(offer);
  }

  try {
    const response = await getClient().beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 8_000,
      // Fallback de recusa no lado do servidor: se os classificadores recusarem,
      // a Anthropic reexecuta o pedido no modelo recomendado automaticamente.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: COPY_SCHEMA },
      },
      messages: [{ role: 'user', content: buildUserPrompt(offer) }],
    });

    if (response.stop_reason === 'refusal') {
      logger.warn(`Claude recusou a geração para "${offer.title}" — usando template`);
      return buildFallbackCopy(offer);
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) throw new Error('resposta sem conteúdo de texto');

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const hashtags = normalizeHashtags(parsed.hashtags);
    const fallback = buildFallbackCopy(offer);

    return {
      pinTitle: truncate(String(parsed.pinTitle ?? fallback.pinTitle), PIN_TITLE_MAX),
      pinDescription: truncate(
        String(parsed.pinDescription ?? fallback.pinDescription),
        PIN_DESCRIPTION_MAX,
      ),
      hashtags: hashtags.length > 0 ? hashtags : fallback.hashtags,
      telegramCaption: String(parsed.telegramCaption ?? fallback.telegramCaption).trim(),
      source: 'claude',
    };
  } catch (error) {
    logger.warn(`Falha ao gerar copy com IA para "${offer.title}":`, (error as Error).message);
    return buildFallbackCopy(offer);
  }
}

export { normalizeHashtags, truncate };
