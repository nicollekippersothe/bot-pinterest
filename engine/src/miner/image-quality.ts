import sharp from 'sharp';
import { logger } from '../utils/logger.js';

/**
 * Filtro de qualidade das fotos do anúncio.
 *
 * Vendedores da Shopee misturam na galeria fotos do produto, tabelas
 * nutricionais, códigos de barras e tabelas de medidas. Publicar uma dessas
 * como pin queima o alcance da conta.
 *
 * O que dá para medir sem IA: rótulo e código de barras são praticamente
 * **sem cor** e cheios de **preto e branco puros**. Isso os separa bem de uma
 * foto de produto.
 *
 * O que NÃO dá: distinguir um infográfico colorido (com modelo, fundo
 * estilizado) de uma foto ambientada de verdade — os dois têm a mesma
 * assinatura estatística. Para isso é preciso visão de modelo.
 */

export interface ImageScore {
  /** Divergência entre os canais RGB. Perto de 0 = imagem cinza. */
  colorfulness: number;
  /** % de pixels quase pretos ou quase brancos. Alto = texto/código. */
  extremes: number;
  entropy: number;
  /** Falso quando a foto tem cara de rótulo/código de barras. */
  usable: boolean;
  reason?: string;
}

/** Abaixo disso a imagem é essencialmente cinza. */
const MIN_COLORFULNESS = 2.5;
/** Acima disso a imagem é dominada por preto/branco puros. */
const MAX_EXTREMES = 0.62;

export async function scoreImage(buffer: Buffer): Promise<ImageScore> {
  const image = sharp(buffer);
  const stats = await image.stats();
  const [r, g, b] = stats.channels;

  const colorfulness = Math.max(
    Math.abs(r.mean - g.mean),
    Math.abs(g.mean - b.mean),
    Math.abs(r.mean - b.mean),
  );

  // Amostra pequena em cinza: só precisamos da proporção, não do detalhe.
  const pixels = await image.clone().greyscale().resize(120, 120, { fit: 'fill' }).raw().toBuffer();
  let extremeCount = 0;
  for (const value of pixels) {
    if (value < 28 || value > 228) extremeCount += 1;
  }
  const extremes = extremeCount / pixels.length;

  let reason: string | undefined;
  if (colorfulness < MIN_COLORFULNESS && extremes > MAX_EXTREMES) {
    reason = 'parece rótulo ou código de barras (sem cor e muito preto/branco)';
  }

  return {
    colorfulness: Math.round(colorfulness * 10) / 10,
    extremes: Math.round(extremes * 1000) / 1000,
    entropy: Math.round(stats.entropy * 100) / 100,
    usable: reason === undefined,
    reason,
  };
}

/**
 * Baixa os candidatos na ordem da galeria e devolve o primeiro que passa no
 * filtro, a partir de `preferredIndex`. Se nenhum passar, devolve null — a
 * oferta é pulada, o que é melhor do que publicar um pin ruim.
 */
export async function pickUsableImage(
  gallery: string[],
  preferredIndex: number,
  download: (url: string) => Promise<Buffer>,
  maxCandidates = 4,
): Promise<string | null> {
  // Começa pela foto preferida e segue pela galeria; a de catálogo (índice 0)
  // fica por último, como rede de segurança.
  const order = [
    ...gallery.slice(preferredIndex, preferredIndex + maxCandidates),
    ...gallery.slice(0, preferredIndex),
  ].slice(0, maxCandidates);

  for (const url of order) {
    try {
      const score = await scoreImage(await download(url));
      if (score.usable) return url;
      logger.debug(`foto descartada — ${score.reason} (cor=${score.colorfulness}, extremos=${score.extremes})`);
    } catch (error) {
      logger.debug(`falha ao avaliar foto: ${(error as Error).message}`);
    }
  }

  return null;
}
