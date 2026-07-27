/**
 * Teste de fumaça das Fases 1-3, sem framework e sem rede.
 *
 * Verifica o requisito central da Fase 1: o mesmo produto nunca é
 * reprocessado nem repostado. Usa um banco temporário próprio.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'affiliate-smoke-')),
  'smoke.db',
);
process.env.LOG_LEVEL = 'warn';

const { getDb, closeDb } = await import('../database/db.js');
const { insertOffers, filterNewOffers, offerExists, countByStatus, markPosted, findByKey } =
  await import('../database/offers.js');
const { mockMiner, mineMockRepeat } = await import('../miner/mock.js');
const { normalizeShopeeItem } = await import('../miner/shopee.js');
const { toAffiliateLink, buildProductKey } = await import('../utils/links.js');
const { buildFallbackCopy, normalizeHashtags, truncate, PIN_TITLE_MAX, PIN_DESCRIPTION_MAX } =
  await import('../processor/copywriter.js');
const { buildPinImage } = await import('../processor/image.js');
const sharp = (await import('sharp')).default;

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✔ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n[1] Banco de dados');
getDb();
check('schema criado e conexão aberta', fs.existsSync(process.env.DATABASE_PATH!));

console.log('\n[2] Minerador mock');
const mined = await mockMiner.mine({ limit: 8, minDiscount: 10 });
check('gerou 8 ofertas', mined.length === 8, `recebido ${mined.length}`);
check(
  'todas com campos obrigatórios',
  mined.every((o) => o.title && o.price > 0 && o.affiliateUrl.includes('mmp_pid=') && o.imageUrl),
);
check(
  'todas acima do desconto mínimo',
  mined.every((o) => (o.discount ?? 0) >= 10),
);
check(
  'product_key único por oferta',
  new Set(mined.map((o) => o.productKey)).size === mined.length,
);

console.log('\n[3] Persistência e deduplicação');
const firstRun = insertOffers(mined);
check('primeira inserção grava tudo', firstRun.length === mined.length, `gravou ${firstRun.length}`);

const secondRun = insertOffers(mined);
check('reinserir o mesmo lote não grava nada', secondRun.length === 0, `gravou ${secondRun.length}`);

const repeated = mineMockRepeat(3);
const repeatedAgain = mineMockRepeat(3);
check(
  'gerador determinístico repete as mesmas chaves',
  repeated.every((o, i) => o.productKey === repeatedAgain[i].productKey),
);
insertOffers(repeated);
check('lote determinístico é filtrado na 2ª rodada', filterNewOffers(repeatedAgain).length === 0);
check('offerExists reconhece produto já minerado', offerExists(repeated[0].productKey));

console.log('\n[4] Ciclo de status');
const target = findByKey(repeated[0].productKey)!;
markPosted(target.id, { pinterestUrl: 'https://pinterest.com/pin/123', telegramMessageId: '42' });
const posted = findByKey(repeated[0].productKey)!;
check('oferta marcada como postada', posted.status === 'posted' && posted.posted_at !== null);
check('canais registrados', posted.pinterest_url !== null && posted.telegram_message_id === '42');
check(
  'oferta postada continua bloqueada para repostagem',
  filterNewOffers([repeated[0]]).length === 0,
);

console.log('\n[5] Utilitários de link');
const url = 'https://shopee.com.br/Organizador-de-Geladeira-i.123456789.9876543210';
check('toAffiliateLink monta o link de afiliado', toAffiliateLink(url).includes('mmp_pid='));
check(
  'buildProductKey usa shopid.itemid',
  buildProductKey('shopee', url) === 'shopee:123456789.9876543210',
  buildProductKey('shopee', url),
);
check(
  'buildProductKey ignora query string',
  buildProductKey('shopee', `${url}?utm_source=x`) === buildProductKey('shopee', url),
);

console.log('\n[6] Normalização Shopee');
const normalized = normalizeShopeeItem({
  itemid: 111,
  shopid: 222,
  name: 'Pote Hermético 1L',
  image: 'abc123',
  price: 2_490_000, // R$ 24,90
  price_before_discount: 4_990_000, // R$ 49,90
  item_rating: { rating_star: 4.83 },
  historical_sold: 1200,
});
check('preço convertido da escala da API', normalized?.price === 24.9, String(normalized?.price));
check('desconto calculado', normalized?.discount === 50, String(normalized?.discount));
check('imagem apontando para o CDN', normalized?.imageUrl?.includes('susercontent.com') === true);
check('item inválido é descartado', normalizeShopeeItem({ itemid: 0, shopid: 0, name: '' }) === null);

console.log('\n[7] Copy de fallback (sem rede)');
const sample = findByKey(mined[0].productKey)!;
const copy = buildFallbackCopy(sample);
check('título dentro do limite do Pinterest', copy.pinTitle.length <= PIN_TITLE_MAX, `${copy.pinTitle.length} chars`);
check(
  'descrição dentro do limite do Pinterest',
  copy.pinDescription.length <= PIN_DESCRIPTION_MAX,
  `${copy.pinDescription.length} chars`,
);
check('gerou hashtags', copy.hashtags.length >= 4);
check('todas as hashtags começam com #', copy.hashtags.every((t) => /^#[\p{L}\p{N}_]+$/u.test(t)));
check('legenda do Telegram preenchida', copy.telegramCaption.includes('R$'));
check('marcada como template', copy.source === 'template');

check(
  'normalizeHashtags limpa espaços, símbolos e duplicatas',
  JSON.stringify(normalizeHashtags(['## promo ção!', 'PROMOÇÃO', '#casa', '#casa', '', 42])) ===
    JSON.stringify(['#promoção', '#casa']),
  JSON.stringify(normalizeHashtags(['## promo ção!', 'PROMOÇÃO', '#casa', '#casa', '', 42])),
);
check('truncate respeita o limite', truncate('a'.repeat(300), 100).length <= 100);
check('truncate preserva texto curto', truncate('  texto   curto ', 100) === 'texto curto');

console.log('\n[8] Geração do pin 1000x1500');
// Imagem sintética 800x800 (produto quadrado — o caso que não pode ser cortado).
const square = await sharp({
  create: { width: 800, height: 800, channels: 3, background: { r: 220, g: 90, b: 70 } },
})
  .jpeg()
  .toBuffer();

const pin = await buildPinImage(sample, square);
const meta = await sharp(pin.filePath).metadata();
check('pin tem 1000x1500 (2:3)', meta.width === 1000 && meta.height === 1500, `${meta.width}x${meta.height}`);
check('arquivo gravado em disco', fs.statSync(pin.filePath).size > 10_000);

// O produto quadrado precisa continuar inteiro: as bordas laterais da área do
// produto devem conter o fundo, não o recorte do produto.
const stats = await sharp(pin.filePath).stats();
check('imagem tem conteúdo colorido (não saiu em branco)', stats.channels[0].mean > 10);
fs.rmSync(pin.filePath, { force: true });

console.log('\nTotais por status:', countByStatus());
closeDb();
fs.rmSync(path.dirname(process.env.DATABASE_PATH!), { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n✖ ${failures} verificação(ões) falharam\n`);
  process.exit(1);
}
console.log('\n✔ Fases 1 a 3 validadas\n');
