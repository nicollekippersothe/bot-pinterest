/**
 * Verifica a configuração do Telegram antes de publicar de verdade.
 *
 *   npm run engine:telegram          # só checa token e acesso ao canal
 *   npm run engine:telegram -- --send  # envia um post de teste ao canal
 */
import { config } from '../config/index.js';
import { closeDb } from '../database/db.js';
import { listByStatus } from '../database/offers.js';
import { OFFER_STATUS } from '../database/schema.js';
import { buildCaption, checkTelegramAccess, isTelegramConfigured, publishToTelegram } from '../publisher/index.js';

async function main(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.error('\n✖ Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHANNEL_ID no .env\n');
    console.error('  1. Fale com @BotFather no Telegram e use /newbot para criar o bot');
    console.error('  2. Crie um CANAL (não grupo) e adicione o bot como ADMINISTRADOR');
    console.error('  3. TELEGRAM_CHANNEL_ID é o @usuario do canal (ex.: @meusachadinhos)\n');
    process.exit(1);
  }

  const { botName, chatTitle } = await checkTelegramAccess();
  console.log(`\n✔ Bot conectado: @${botName}`);
  console.log(`✔ Canal acessível: ${chatTitle} (${config.telegram.channelId})`);

  const [offer] = listByStatus(OFFER_STATUS.PROCESSED, 1);
  if (!offer) {
    console.log('\nNenhuma oferta processada na fila. Rode `npm run engine` antes.\n');
    return;
  }

  console.log('\n--- Prévia da legenda ---');
  console.log(buildCaption(offer));
  console.log(`--- Botão: 🛒 Ver oferta na Shopee -> ${offer.affiliate_url}`);
  console.log(`--- Imagem: ${offer.pin_image_path}\n`);

  if (!process.argv.includes('--send')) {
    console.log('Rode com --send para publicar este post de teste no canal.\n');
    return;
  }

  const { messageId } = await publishToTelegram(offer);
  console.log(`\n✔ Publicado no canal (mensagem ${messageId})\n`);
}

main()
  .catch((error) => {
    console.error(`\n✖ ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(closeDb);
