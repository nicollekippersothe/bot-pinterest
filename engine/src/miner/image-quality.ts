import sharp from 'sharp';
import { logger } from '../utils/logger.js';

/**
 * Escolha da foto do anúncio.
 *
 * No Pinterest quem faz a pessoa clicar é a foto, não o preço. A foto de
 * catálogo (produto recortado no branco) é justamente a que menos chama
 * atenção no feed — e é a que o vendedor costuma colocar primeiro.
 *
 * A boa notícia, medida na galeria real da Shopee: quando existe uma foto
 * ambientada, ela se separa das demais por **entropia**. Cena tem muito mais
 * informação visual que produto no branco:
 *
 *   foto ambientada        6.4 a 7.0   borda branca ~1%
 *   catálogo / infográfico 1.7 a 4.0   borda branca 90 a 100%
 *
 * Também é preciso descartar o lixo que os vendedores misturam na galeria:
 * tabela nutricional, código de barras, logo. Isso é quase sem cor e cheio de
 * preto e branco puros, o que separa bem de foto de produto.
 *
 * O que continua fora do alcance sem visão de modelo: distinguir um
 * infográfico colorido e ambientado de uma foto de produto de verdade.
 */

export interface ImageScore {
  /** Divergência entre os canais RGB. Perto de 0 = imagem cinza. */
  colorfulness: number;
  /** % de pixels quase pretos ou quase brancos. Alto = texto/código. */
  extremes: number;
  /** Informação visual. Acima de ~5 indica cena, não produto no branco. */
  entropy: number;
  /** % da moldura que é branco puro. Alto = foto de catálogo recortada. */
  borderWhite: number;
  /** Foto ambientada — a que converte no Pinterest. */
  scene: boolean;
  /** Falso quando a foto tem cara de rótulo, código de barras ou logo. */
  usable: boolean;
  reason?: string;
}

/** Abaixo disso a imagem é essencialmente cinza. */
const MIN_COLORFULNESS = 2.5;
/** Acima disso a imagem é dominada por preto/branco puros. */
const MAX_EXTREMES = 0.62;
/** Entropia a partir da qual a foto tem complexidade de cena. */
const SCENE_ENTROPY = 5;
/** Moldura branca demais para ser cena, ainda que a entropia engane. */
const SCENE_MAX_BORDER_WHITE = 0.5;

/** Fração da moldura que é branco puro — mede fundo de catálogo. */
async function measureBorderWhite(image: ReturnType<typeof sharp>): Promise<number> {
  const size = 200;
  const { data } = await image
    .clone()
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const at = (x: number, y: number): boolean => {
    const i = (y * size + x) * 3;
    return data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238;
  };

  let white = 0;
  for (let i = 0; i < size; i += 1) {
    if (at(i, 0)) white += 1;
    if (at(i, size - 1)) white += 1;
    if (at(0, i)) white += 1;
    if (at(size - 1, i)) white += 1;
  }
  return white / (size * 4);
}

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
  const borderWhite = await measureBorderWhite(image);

  let reason: string | undefined;
  if (colorfulness < MIN_COLORFULNESS && extremes > MAX_EXTREMES) {
    reason = 'parece rótulo, logo ou código de barras (sem cor e muito preto/branco)';
  }

  return {
    colorfulness: Math.round(colorfulness * 10) / 10,
    extremes: Math.round(extremes * 1000) / 1000,
    entropy: Math.round(stats.entropy * 100) / 100,
    borderWhite: Math.round(borderWhite * 100) / 100,
    scene: stats.entropy >= SCENE_ENTROPY && borderWhite < SCENE_MAX_BORDER_WHITE,
    usable: reason === undefined,
    reason,
  };
}

/**
 * Baixa os candidatos na ordem da galeria e devolve o primeiro que passa no
 * filtro, a partir de `preferredIndex`. Se nenhum passar, devolve null — a
 * oferta é pulada, o que é melhor do que publicar um pin ruim.
 *
 * Por que não escolher a foto de maior entropia, já que cena tem entropia bem
 * mais alta que catálogo: infográfico e colagem de "como usar" também têm, e
 * medindo em galerias reais eles vencem a disputa. Não é ruído de amostra —
 * eles *são* fotos, com texto por cima, então nenhuma estatística de cor,
 * planura ou borda os separa. Foi testado e a seleção por entropia trocou
 * quatro fotos boas por infográficos.
 *
 * Achar a foto ambientada de verdade exige ler o que está na imagem, ou seja
 * visão de modelo. Até lá, a ordem da galeria é o melhor palpite disponível.
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
