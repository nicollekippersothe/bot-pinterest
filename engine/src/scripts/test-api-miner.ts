/**
 * Teste da fonte "api" sem rede e sem credenciais: troca o fetch por uma resposta simulada.
 * Uso: npm run engine:test:api
 */
import assert from 'node:assert/strict';

process.env.AFFILIATE_APP_ID = 'teste';
process.env.AFFILIATE_SECRET = 'segredo';
process.env.DATABASE_PATH = ':memory:';

const { mapNode, passesFilters } = await import('../miner/affiliate-api.js');

// 1) Mapeamento: taxa em fração vira percentual; link rastreado é obrigatório.
const bom = mapNode({
  itemId: 111, shopId: 222, productName: ' Tábua de Corte ', price: '24.79', sales: 5000,
  ratingStar: '4.8', commissionRate: '0.13', offerLink: 'https://s.shopee.com.br/abc',
});
assert.ok(bom, 'oferta válida deve mapear');
assert.equal(bom.productKey, 'shopee:222.111');
assert.equal(bom.title, 'Tábua de Corte');
assert.equal(bom.commissionRate, 13);
assert.equal(bom.affiliateUrl, 'https://s.shopee.com.br/abc');
assert.equal(bom.originalUrl, 'https://shopee.com.br/product/222/111');
assert.ok(Math.abs((bom.commissionValue ?? 0) - 3.2227) < 0.001);

assert.equal(mapNode({ itemId: 1, shopId: 2, productName: 'x', price: 10, offerLink: '' }), null, 'sem link rastreado');
assert.equal(mapNode({ itemId: 1, shopId: 2, productName: 'x', price: 0, offerLink: 'https://s.shopee.com.br/z' }), null, 'preço zero');

// 2) Filtros: comissão >= 8%, vendas >= 100, nota >= 4,5.
assert.equal(passesFilters(bom), true);
assert.equal(passesFilters({ ...bom, commissionRate: 5 }), false, 'comissão baixa');
assert.equal(passesFilters({ ...bom, sold: 10 }), false, 'poucas vendas');
assert.equal(passesFilters({ ...bom, rating: 3.9 }), false, 'nota baixa');

console.log('OK: mapeamento e filtros da fonte "api"');
