import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Extrai `shopid` e `itemid` de uma URL de produto da Shopee.
 *
 * Dois formatos convivem e precisam gerar a MESMA chave, senão a
 * deduplicação falha entre fontes diferentes:
 * - `https://shopee.com.br/<slug>-i.<shopid>.<itemid>` (busca/site)
 * - `https://shopee.com.br/product/<shopid>/<itemid>`  (painel de afiliados)
 */
export function parseShopeeUrl(url: string): { shopId: string; itemId: string; slug: string } | null {
  const slugFormat = url.match(/\/(?:([^/?#]*?)-)?i\.(\d+)\.(\d+)/);
  if (slugFormat) {
    return { slug: slugFormat[1] || 'produto', shopId: slugFormat[2], itemId: slugFormat[3] };
  }

  const productFormat = url.match(/\/product\/(\d+)\/(\d+)/);
  if (productFormat) {
    return { slug: 'produto', shopId: productFormat[1], itemId: productFormat[2] };
  }

  return null;
}

/** Monta o link de afiliado Shopee a partir de shopid/itemid. */
export function buildShopeeAffiliateLink(shopId: string, itemId: string, slug?: string): string {
  const name = slug?.trim() ? slug : 'produto';
  const affiliateId = config.shopeeAffiliateId;
  return (
    `https://shopee.com.br/${name}-i.${shopId}.${itemId}` +
    `?mmp_pid=${affiliateId}&utm_medium=affiliates&utm_source=${affiliateId}`
  );
}

/**
 * Converte qualquer URL de produto Shopee em link de afiliado.
 * Retorna a URL original quando o padrão não é reconhecido.
 */
export function toAffiliateLink(url: string): string {
  const parsed = parseShopeeUrl(url);
  if (!parsed) return url;
  return buildShopeeAffiliateLink(parsed.shopId, parsed.itemId, parsed.slug);
}

/**
 * Chave estável usada para deduplicação.
 * Prefere o par shopid/itemid; cai para um hash da URL limpa.
 */
export function buildProductKey(platform: string, url: string): string {
  const parsed = parseShopeeUrl(url);
  if (parsed) return `${platform}:${parsed.shopId}.${parsed.itemId}`;
  const clean = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  const hash = crypto.createHash('sha1').update(clean).digest('hex').slice(0, 16);
  return `${platform}:${hash}`;
}

/** Converte texto em slug seguro para nomes de arquivo. */
export function slugify(value: string, maxLength = 60): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}
