import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR, PUBLIC_PINS_DIR } from '../config/index.js';
import { findById, listByStatus, updateOffer, type OfferRow } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { generatePin } from '../processor/image.js';
import { logger } from '../utils/logger.js';
import { writeRssFeed } from './rss.js';
import { parseHashtags } from './telegram.js';

/**
 * Publica as ofertas prontas como um feed estático dentro de `public/`.
 *
 * O Vite copia `public/` para `dist/`, que é o que a Vercel serve — então os
 * pins ganham uma URL pública sem serviço novo. O Pinterest precisa disso:
 * quem baixa a imagem é o servidor dele, não o navegador.
 *
 * O Make lê `feed.json` por HTTP e publica os itens.
 */

export interface FeedItem {
  id: number;
  title: string;
  description: string;
  hashtags: string[];
  /** Descrição + hashtags, pronta para colar no campo do Pinterest. */
  pinterestDescription: string;
  /** URL pública do pin 1000x1500. */
  imageUrl: string;
  /** Link de afiliado rastreado. */
  link: string;
  /** Quando entrou no feed (ISO 8601), para filtros por data no Make. */
  feedAt: string;
  price: number;
  originalPrice: number | null;
  discount: number;
  commissionRate: number | null;
  category: string | null;
}

/**
 * Identificação obrigatória de publicidade.
 *
 * Pin com link de afiliado precisa ser identificado como tal — é regra do
 * Pinterest e é o que as normas de publicidade exigem de qualquer conteúdo
 * pago. `#publi` é o termo que o público brasileiro reconhece; `#ad` é o que os
 * sistemas automáticos da plataforma procuram. Vai no começo, porque a
 * descrição aparece truncada no feed e divulgação escondida não vale.
 */
const DISCLOSURE = '#publi #ad';

/** Descrição final: divulgação + texto de conversão + hashtags, no limite do Pinterest. */
function buildPinterestDescription(offer: OfferRow): string {
  const description = offer.pin_description ?? offer.title;
  const hashtags = parseHashtags(offer.hashtags)
    .filter((tag) => !/^#(publi|ad|afiliado|publicidade)$/i.test(tag))
    .slice(0, 6)
    .join(' ');

  const parts = [`${DISCLOSURE} ${description}`];
  if (hashtags) parts.push(hashtags);
  const combined = parts.join('\n\n');

  return combined.length <= 800 ? combined : combined.slice(0, 797).trimEnd() + '…';
}

function toFeedItem(offer: OfferRow, fileName: string, feedAt: string): FeedItem {
  return {
    id: offer.id,
    feedAt,
    title: (offer.pin_title ?? offer.title).slice(0, 100),
    description: offer.pin_description ?? '',
    hashtags: parseHashtags(offer.hashtags),
    pinterestDescription: buildPinterestDescription(offer),
    imageUrl: `${config.publicBaseUrl.replace(/\/+$/, '')}/pins/${fileName}`,
    link: offer.affiliate_url,
    price: offer.price,
    originalPrice: offer.original_price,
    discount: offer.discount,
    commissionRate: offer.commission_rate,
    category: offer.category,
  };
}

/**
 * Recalcula a descrição de um item que já estava na janela.
 *
 * A descrição é montada uma vez, na entrada do feed. Sem isto, uma correção no
 * texto — como a identificação de publicidade — só valeria para oferta nova, e
 * o que está na fila sairia sem ela. O GUID não muda, então item já publicado
 * não é republicado por causa disso.
 */
function refreshDescription(item: FeedItem): FeedItem {
  const offer = findById(item.id);
  if (!offer) return item;
  return { ...item, pinterestDescription: buildPinterestDescription(offer) };
}

/**
 * Devolve o caminho do pin da oferta, gerando de novo se o arquivo sumiu.
 *
 * `storage/images/` não é versionado, mas o banco é. No GitHub Actions o clone
 * traz o `pin_image_path` de uma máquina que o runner nunca viu, e o arquivo
 * não existe ali. Antes disso ser tratado, a oferta era pulada sem receber
 * `feed_at` — então era pulada de novo em toda execução, para sempre.
 */
async function ensurePin(offer: OfferRow): Promise<string | null> {
  if (offer.pin_image_path && fs.existsSync(offer.pin_image_path)) {
    return offer.pin_image_path;
  }

  if (!offer.image_url) {
    logger.warn(`Oferta ${offer.id} não tem imagem de origem — fora do feed.`);
    return null;
  }

  try {
    const { filePath } = await generatePin(offer);
    updateOffer(offer.id, { pin_image_path: filePath });
    logger.info(`Pin da oferta ${offer.id} regenerado (arquivo não estava no disco).`);
    return filePath;
  } catch (error) {
    logger.warn(`Oferta ${offer.id}: falha ao gerar o pin — ${(error as Error).message}`);
    return null;
  }
}

/**
 * Copia os pins para `public/pins/` e (re)escreve `public/feed.json`.
 *
 * Só entram ofertas ainda não enfileiradas (`feed_at` vazio), então rodar de
 * novo não duplica nada — mesma garantia do resto do pipeline.
 */
export async function publishFeed(limit = config.publishBatchSize): Promise<FeedItem[]> {
  if (!config.publicBaseUrl) {
    throw new Error(
      'PUBLIC_BASE_URL não configurada no .env (ex.: https://seu-app.vercel.app)',
    );
  }

  const ready = listByStatus(OFFER_STATUS.PROCESSED, 100).filter((offer) => !offer.feed_at);
  const batch = ready.slice(0, limit);

  if (batch.length === 0) {
    logger.info('Nenhuma oferta nova para o feed.');
    const current = readFeed();
    writeRssFeed(current);
    return current;
  }

  fs.mkdirSync(PUBLIC_PINS_DIR, { recursive: true });

  const added: FeedItem[] = [];
  for (const offer of batch) {
    const pinPath = await ensurePin(offer);
    if (!pinPath) continue;

    const fileName = path.basename(pinPath);
    fs.copyFileSync(pinPath, path.join(PUBLIC_PINS_DIR, fileName));

    const feedAt = new Date().toISOString();
    added.push(toFeedItem(offer, fileName, feedAt));
    updateOffer(offer.id, { feed_at: feedAt });
  }

  // O feed é uma janela dos itens mais recentes, não um arquivo histórico:
  // o Make consulta o Data Store item a item, e cada item custa operação.
  // Quem garante que nada é republicado é o Data Store, não o tamanho daqui.
  // Uma oferta reenfileirada (feed_at de volta a nulo) já está na janela antiga
  // com o feedAt anterior. Sem descartar a versão velha, o mesmo produto sairia
  // duas vezes no RSS — com GUIDs diferentes, virando dois pins.
  const addedIds = new Set(added.map((item) => item.id));
  const previous = readFeed()
    .filter((item) => !addedIds.has(item.id))
    .map(refreshDescription);
  const feed = [...added, ...previous].slice(0, config.feedMaxItems);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(feedPath(), JSON.stringify(feed, null, 2));
  writeRssFeed(feed);

  logger.success(`Feed atualizado: +${added.length} pin(s), ${feed.length} na janela`);
  logger.info(`Publique com: npm run build && vercel --prod (ou git push, se houver deploy automático)`);
  return feed;
}

function feedPath(): string {
  return path.join(PUBLIC_DIR, 'feed.json');
}

/** Lê o feed atual; devolve vazio se ainda não existir ou estiver corrompido. */
export function readFeed(): FeedItem[] {
  try {
    const raw = fs.readFileSync(feedPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeedItem[]) : [];
  } catch {
    return [];
  }
}
