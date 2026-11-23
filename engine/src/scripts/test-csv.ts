/**
 * Teste do CSV do Pinterest, sem rede: banco em memória e arquivos temporários.
 * Uso: npm run engine:test:csv
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH = ':memory:';
process.env.PUBLIC_BASE_URL = 'https://exemplo.test/';

const { insertOffers, updateOffer, listRecent } = await import('../database/offers.js');
const { exportPinterestCsv, scheduleTimes, CSV_HEADER, MAX_PINS_PER_FILE } = await import('../publisher/pinterest-csv.js');
const { parseCsv } = await import('../utils/csv.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
const image = path.join(tmp, 'pin.png');
fs.writeFileSync(image, 'png');

// 1) Agenda: N por dia, tudo na janela de 12h a 23h30 UTC, no formato AAAA-MM-DDTHH:MM:SS.
for (const perDay of [1, 3, 5, 10]) {
  const times = scheduleTimes(perDay * 4, perDay, '2026-12-01');
  assert.equal(times.length, perDay * 4);
  for (const [i, t] of times.entries()) {
    assert.match(t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
    const d = new Date(`${t}Z`);
    const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    assert.ok(minutes >= 12 * 60 && minutes <= 23 * 60 + 30, `fora da janela: ${t}`);
    assert.equal(t.slice(0, 10), new Date(Date.parse('2026-12-01T00:00:00Z') + Math.floor(i / perDay) * 86_400_000).toISOString().slice(0, 10));
  }
  const day1 = times.slice(0, perDay).map((t) => Date.parse(`${t}Z`));
  for (let k = 1; k < day1.length; k += 1) assert.ok(day1[k]! > day1[k - 1]!, 'horários do dia fora de ordem');
}

// 2) Exportação: 7 ofertas prontas, lote de 2 dias x 3 por dia = 6 pins.
insertOffers(
  Array.from({ length: 7 }, (_, i) => ({
    productKey: `shopee:1.${i}`, platform: 'shopee' as const, title: `Produto ${i}`,
    originalUrl: `https://shopee.com.br/product/1/${i}`, affiliateUrl: `https://s.shopee.com.br/link${i}?a=1&b=2`,
    imageUrl: 'https://cf.shopee.com.br/file/x', price: 10 + i,
  })),
);
for (const offer of listRecent(50)) {
  updateOffer(offer.id, {
    status: 'processed',
    pin_title: offer.id === 1 ? 'T'.repeat(150) : `Achado, "especial" ${offer.id}`,
    pin_description: 'D'.repeat(offer.id === 1 ? 900 : 60) + '\nsegunda linha',
    hashtags: JSON.stringify(['#cozinha', '#publi', '#casa', '#Achadinhos']),
    pin_image_path: image,
  });
}

const result = await exportPinterestCsv({ days: 2, perDay: 3, startDate: '2026-12-01', board: 'Achados BR', dryRun: true, outDir: tmp });
assert.equal(result.count, 6, 'deveria exportar 6 de 7 prontas');

const table = parseCsv(fs.readFileSync(result.filePath, 'utf8')).filter((r) => r.some(Boolean));
assert.deepEqual(table[0], [...CSV_HEADER], 'cabeçalho');
assert.equal(table.length, 7, 'cabeçalho + 6 linhas');

for (const row of table.slice(1)) {
  const [title, media, board, thumb, desc, link, date, keywords] = row as string[];
  assert.ok(title!.length <= 100, 'título > 100');
  assert.ok(desc!.length <= 500, 'descrição > 500');
  assert.ok(!/[\r\n]/.test(desc!), 'quebra de linha na descrição');
  assert.ok(desc!.startsWith('#publi #ad'), 'sem identificação de publicidade');
  assert.match(media!, /^https:\/\/exemplo\.test\/pins\/pin\.png$/);
  assert.equal(board, 'Achados BR');
  assert.equal(thumb, '');
  assert.match(link!, /^https:\/\/s\.shopee\.com\.br\/link\d\?a=1&b=2$/, 'link de afiliado deve ficar intacto');
  assert.match(date!, /^2026-12-0[12]T\d{2}:\d{2}:00$/);
  assert.ok(!keywords!.includes('publi'), 'keyword de divulgação');
}
const longRow = table.find((r) => r[0]!.startsWith('TTTT'))!;
assert.equal(longRow[0]!.length, 100);
assert.ok(longRow[4]!.length <= 500 && longRow[4]!.length >= 490, 'descrição longa deve ser cortada perto de 500');
assert.ok(table.some((r) => r[0]!.includes('"especial"')), 'aspas e vírgula no título precisam sobreviver ao CSV');

// 3) Dry run não marca nada; o lote real marca e não repete.
assert.equal(listRecent(50).filter((o) => o.feed_at).length, 0, 'dry run não pode marcar ofertas');
assert.equal(MAX_PINS_PER_FILE, 200);

await assert.rejects(() => exportPinterestCsv({ days: 1, perDay: 1, board: '  ', dryRun: true, outDir: tmp }), /quadro/i);

console.log(`OK: ${result.count} pins, cabeçalho, limites, datas, escape e dry run`);
