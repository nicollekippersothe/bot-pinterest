import crypto from 'node:crypto';
import { buildShopeeAffiliateLink, buildProductKey, slugify } from '../utils/links.js';
import { logger } from '../utils/logger.js';
import { calcDiscount, type MinedOffer, type Miner, type MinerOptions } from './types.js';

/**
 * Catálogo base do gerador simulado. Serve para exercitar o pipeline inteiro
 * (banco -> IA -> imagem -> publicação) sem depender de scraping.
 */
const CATALOG: { name: string; category: string; basePrice: number }[] = [
  { name: 'Organizador de Geladeira Empilhável', category: 'Cozinha', basePrice: 39.9 },
  { name: 'Processador de Alho Manual', category: 'Cozinha', basePrice: 29.9 },
  { name: 'Mop Giratório com Balde', category: 'Limpeza', basePrice: 89.9 },
  { name: 'Luminária LED de Mesa Recarregável', category: 'Decoração', basePrice: 59.9 },
  { name: 'Kit 6 Potes Herméticos para Mantimentos', category: 'Cozinha', basePrice: 74.9 },
  { name: 'Suporte Articulado para Celular', category: 'Eletrônicos', basePrice: 24.9 },
  { name: 'Cesto Organizador Dobrável de Roupas', category: 'Organização', basePrice: 45.0 },
  { name: 'Tapete Antiderrapante para Banheiro', category: 'Banheiro', basePrice: 34.9 },
  { name: 'Aparador de Fios e Pelos para Roupas', category: 'Utilidades', basePrice: 19.9 },
  { name: 'Difusor de Aromas Ultrassônico', category: 'Decoração', basePrice: 99.9 },
  { name: 'Escorredor de Louças Retrátil de Pia', category: 'Cozinha', basePrice: 64.9 },
  { name: 'Organizador de Gavetas com Divisórias', category: 'Organização', basePrice: 42.5 },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Gera uma oferta simulada com IDs novos a cada execução, de modo que o
 * controle de duplicidade possa ser testado tanto no caminho "novo" quanto no
 * caminho "repetido" (ver `mineMockRepeat`).
 */
function buildOffer(
  seed: { name: string; category: string; basePrice: number },
  ids: { shopId: string; itemId: string },
): MinedOffer {
  const { shopId, itemId } = ids;
  const slug = slugify(seed.name);
  const originalPrice = round2(seed.basePrice);
  const discountPct = randomInt(10, 65);
  const price = round2(originalPrice * (1 - discountPct / 100));
  const originalUrl = `https://shopee.com.br/${slug}-i.${shopId}.${itemId}`;

  return {
    productKey: buildProductKey('shopee', originalUrl),
    platform: 'shopee',
    title: seed.name,
    originalUrl,
    affiliateUrl: buildShopeeAffiliateLink(shopId, itemId, slug),
    // Imagem real e baixável, para que a Fase 3 (sharp) possa ser testada.
    imageUrl: `https://picsum.photos/seed/${slug}-${itemId}/1200/1200`,
    price,
    originalPrice,
    discount: calcDiscount(originalPrice, price),
    rating: round2(randomInt(40, 50) / 10),
    sold: randomInt(50, 5_000),
    category: seed.category,
  };
}

/** Minerador simulado: payload determinístico em formato, aleatório em valores. */
export const mockMiner: Miner = {
  name: 'mock',

  async mine(options: MinerOptions = {}): Promise<MinedOffer[]> {
    const limit = options.limit ?? 10;
    const minDiscount = options.minDiscount ?? 0;

    const offers: MinedOffer[] = [];
    for (let i = 0; i < limit; i += 1) {
      const seed = CATALOG[i % CATALOG.length];
      offers.push(
        buildOffer(seed, {
          shopId: String(randomInt(100_000_000, 999_999_999)),
          itemId: String(randomInt(1_000_000_000, 9_999_999_999)),
        }),
      );
    }

    const filtered = offers.filter((offer) => (offer.discount ?? 0) >= minDiscount);
    logger.debug(`mock: ${filtered.length}/${offers.length} ofertas acima de ${minDiscount}% de desconto`);
    return filtered;
  },
};

/**
 * Gera ofertas com IDs fixos derivados do catálogo. Rodar duas vezes produz as
 * mesmas `product_key`, o que permite verificar que nada é reinserido.
 */
export function mineMockRepeat(limit = 3): MinedOffer[] {
  return CATALOG.slice(0, limit).map((seed) => {
    const digits = crypto.createHash('sha1').update(seed.name).digest('hex').replace(/\D/g, '');
    return buildOffer(seed, {
      shopId: digits.slice(0, 9).padEnd(9, '7'),
      itemId: digits.slice(9, 19).padEnd(10, '1'),
    });
  });
}
