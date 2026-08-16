import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from '../config/index.js';
import { findById } from '../database/offers.js';
import { logger } from '../utils/logger.js';
import type { FeedItem } from './feed.js';

/**
 * Publica o mesmo feed em RSS 2.0, para o gatilho "RSS by Zapier".
 *
 * O plano free do Zapier só aceita Zap de dois passos — um gatilho e uma ação,
 * sem filtro, sem webhook e sem Storage. Não há onde encaixar a deduplicação
 * que o Make fazia com o Data Store.
 *
 * O gatilho de RSS resolve isso de graça: ele guarda os GUIDs que já viu e só
 * dispara para item inédito.
 *
 * O GUID combina o id da oferta com o instante de entrada no feed. Isso importa
 * por causa de um comportamento do Zapier: ao ligar o Zap, o primeiro poll
 * marca como visto tudo que já estava no arquivo, e esses GUIDs nunca mais
 * disparam. Amarrando o GUID ao `feedAt`, basta reenfileirar a oferta
 * (`feed_at` de volta a nulo e novo `engine:feed`) para ela virar item inédito.
 *
 * A contrapartida é que o arquivo não pode conter nada que já esteja no
 * Pinterest: quando o Zap é ligado, o Zapier pode processar itens que já estão
 * no arquivo. Daí a exclusão por `pinterest_url` abaixo.
 */

const IMAGE_MIME = 'image/jpeg';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Já publicada no Pinterest por qualquer canal — não pode voltar ao RSS. */
function alreadyOnPinterest(id: number): boolean {
  return Boolean(findById(id)?.pinterest_url);
}

function toRssItem(item: FeedItem): string {
  const pubDate = new Date(item.feedAt).toUTCString();

  // A URL da imagem vai em `enclosure` (o campo que o Zapier expõe como mídia)
  // e também em `media:content`, porque o parser dele varia conforme o feed.
  return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description>${escapeXml(item.pinterestDescription)}</description>
      <guid isPermaLink="false">pin-${item.id}-${Date.parse(item.feedAt)}</guid>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(item.imageUrl)}" type="${IMAGE_MIME}" length="0"/>
      <media:content url="${escapeXml(item.imageUrl)}" medium="image" type="${IMAGE_MIME}"/>
    </item>`;
}

/**
 * Escreve `public/feed.xml` com os itens ainda não publicados no Pinterest.
 * Devolve quantos itens entraram.
 */
export function writeRssFeed(items: FeedItem[]): number {
  const pending = items.filter((item) => !alreadyOnPinterest(item.id));
  const now = new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Achados do Dia BR</title>
    <link>https://www.pinterest.com/achadosdobr/</link>
    <description>Ofertas selecionadas da Shopee, prontas para virar pin.</description>
    <language>pt-BR</language>
    <lastBuildDate>${now}</lastBuildDate>
${pending.map(toRssItem).join('\n')}
  </channel>
</rss>
`;

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, 'feed.xml'), xml);

  const skipped = items.length - pending.length;
  logger.info(`RSS atualizado: ${pending.length} item(ns) pendente(s), ${skipped} já no Pinterest`);
  return pending.length;
}
