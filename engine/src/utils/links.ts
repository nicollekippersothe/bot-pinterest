import crypto from 'node:crypto';
import { config } from '../config/index.js';

/**
 * Extrai `shopid` e `itemid` de uma URL de produto da Shopee.
 * Formato esperado: https://shopee.com.br/<slug>-i.<shopid>.<itemid>
 */
export function parseShopeeUrl(url: string): { shopId: string; itemId: string; slug: string } | null {
  const match = url.match(/\/(?:([^/?#]*?)-)?i\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { slug: match[1] ?? 'produto', shopId: match[2], itemId: match[3] };
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
