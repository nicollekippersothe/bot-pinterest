import sharp from 'sharp';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Escolha da foto do anúncio por visão de modelo.
 *
 * No Pinterest a foto é o anúncio. A galeria da Shopee quase sempre tem uma
 * foto boa — o produto em uso, numa cozinha, numa cama —, mas ela nunca está
 * numa posição fixa, e no meio vêm infográficos, tabelas de medida, colagens
 * de "como usar" e código de barras.
 *
 * Medir isso sem ler a imagem não funciona: testamos cor, planura e brancura
 * da moldura, e infográfico vence a disputa em todas, porque infográfico *é*
 * foto com texto por cima. O que separa é enxergar o texto.
 *
 * Falha aqui nunca derruba o pipeline: sem chave, com erro de rede ou com
 * resposta fora do previsto, o chamador volta para a heurística.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const REQUEST_TIMEOUT_MS = 45_000;
/** Miniatura basta para julgar composição e ver se há texto — e corta tokens. */
const THUMB_SIZE = 420;

const INSTRUCTIONS = [
  'Você escolhe a foto de um anúncio da Shopee que será publicada como pin no Pinterest.',
  'As imagens vêm numeradas a partir de 0, na ordem em que aparecem.',
  '',
  'Escolha a que funciona melhor como pin, nesta ordem de preferência:',
  '1. Fotografia do produto em uso ou num ambiente real (cozinha, cama, banheiro).',
  '2. Fotografia limpa só do produto, bem iluminada.',
  '',
  'Descarte, sempre:',
  '- imagem com texto, selo, preço ou etiqueta sobreposta;',
  '- infográfico, tabela de medidas, tabela nutricional, lista de benefícios;',
  '- colagem ou sequência de passos "como usar";',
  '- código de barras, logo da marca, foto de embalagem sozinha;',
  '- imagem cortada, esticada ou de resolução visivelmente ruim.',
  '',
  'Responda apenas o índice escolhido. Se todas forem descartáveis, use -1.',
].join('\n');

interface VisionChoice {
  index: number;
  reason?: string;
}

/** Reduz e recomprime — a decisão não precisa de resolução alta. */
async function toThumbnail(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return resized.toString('base64');
}

/**
 * Procura a escolha na resposta sem depender do formato exato do envelope.
 *
 * O corpo da resposta da API varia entre versões; o que não varia é o JSON que
 * pedimos. Percorremos as strings do payload e ficamos com a primeira que traz
 * um índice.
 */
function extractChoice(payload: unknown): VisionChoice | null {
  const texts: string[] = [];

  const walk = (node: unknown): void => {
    if (typeof node === 'string') texts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') Object.values(node).forEach(walk);
  };
  walk(payload);

  for (const text of texts) {
    const match = text.match(/\{[^{}]*"index"[^{}]*\}/);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[0]) as VisionChoice;
      if (Number.isInteger(parsed.index)) return parsed;
    } catch {
      // Segue para o próximo trecho.
    }
  }
  return null;
}

/**
 * Devolve a URL da melhor foto da galeria, ou null quando não dá para decidir
 * (sem chave, erro na chamada, ou o modelo descartou todas).
 */
export async function pickPhotoWithVision(
  gallery: string[],
  download: (url: string) => Promise<Buffer>,
  maxCandidates = 6,
): Promise<string | null> {
  if (!config.geminiApiKey) return null;

  const candidates = gallery.slice(0, maxCandidates);
  if (candidates.length === 0) return null;

  const images: Array<{ type: 'image'; data: string; mime_type: string }> = [];
  const usable: string[] = [];

  for (const url of candidates) {
    try {
      images.push({ type: 'image', data: await toThumbnail(await download(url)), mime_type: 'image/jpeg' });
      usable.push(url);
    } catch (error) {
      logger.debug(`foto ignorada na avaliação por visão: ${(error as Error).message}`);
    }
  }

  if (usable.length === 0) return null;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': config.geminiApiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.geminiModel,
        input: [{ type: 'text', text: INSTRUCTIONS }, ...images],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              reason: { type: 'string' },
            },
            required: ['index'],
          },
        },
      }),
    });

    if (!response.ok) {
      logger.debug(`visão respondeu ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return null;
    }

    const choice = extractChoice(await response.json());
    if (!choice) {
      logger.debug('visão respondeu sem índice reconhecível');
      return null;
    }
    if (choice.index < 0 || choice.index >= usable.length) {
      logger.debug(`visão descartou todas as fotos (índice ${choice.index})`);
      return null;
    }

    logger.debug(`visão escolheu a foto ${choice.index}${choice.reason ? ` — ${choice.reason}` : ''}`);
    return usable[choice.index];
  } catch (error) {
    logger.debug(`falha na avaliação por visão: ${(error as Error).message}`);
    return null;
  }
}
