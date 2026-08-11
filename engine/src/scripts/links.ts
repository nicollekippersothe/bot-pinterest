/**
 * Mostra o que a engine leu dos CSVs do painel de afiliados, antes de
 * qualquer publicação. Use para conferir um lote novo.
 *
 *   npm run engine:links
 */
import { config } from '../config/index.js';
import { loadPanelOffers } from '../miner/panel.js';

const offers = loadPanelOffers();

if (offers.length === 0) {
  console.log(`\nNenhum link encontrado em ${config.panelLinksDir}`);
  console.log('Exporte os lotes no painel (Obter Link em Massa) e salve os .csv nessa pasta.\n');
  process.exit(0);
}

const payout = (o: (typeof offers)[number]): number =>
  o.commissionValue ?? ((o.price * (o.commissionRate ?? 0)) / 100);

console.log(`\n${offers.length} produto(s) com link rastreado, por comissão estimada:\n`);
for (const offer of [...offers].sort((a, b) => payout(b) - payout(a))) {
  const title = offer.title.length > 58 ? `${offer.title.slice(0, 57)}…` : offer.title;
  console.log(
    [
      `R$ ${offer.price.toFixed(2).padStart(7)}`,
      `${String(offer.commissionRate ?? 0).padStart(5)}%`,
      `= R$ ${payout(offer).toFixed(2).padStart(6)}`,
      title,
    ].join('  '),
  );
}

const total = offers.reduce((sum, o) => sum + payout(o), 0);
console.log(`\nComissão total se todos venderem uma vez: R$ ${total.toFixed(2)}`);
console.log('(imagem e desconto vêm do datafeed — rode npm run engine:datafeed)\n');
