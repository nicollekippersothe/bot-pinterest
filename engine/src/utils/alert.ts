import { logger } from './logger.js';

/**
 * Aviso para o dono do projeto pelo Telegram (chat pessoal, não o canal).
 *
 * Usa um bot e um chat próprios (ALERT_TELEGRAM_BOT_TOKEN / ALERT_TELEGRAM_CHAT_ID),
 * separados do bot que publica no canal. Sem as variáveis, só registra no log.
 */
export async function sendAlert(text: string): Promise<boolean> {
  const token = process.env.ALERT_TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID ?? '';
  if (!token || !chatId) {
    logger.warn(`Alerta não enviado (ALERT_TELEGRAM_* não definidos): ${text}`);
    return false;
  }

  const base = process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org';
  try {
    const response = await fetch(`${base}/bot${token}/sendMessage`, {
      method: 'POST',
      body: new URLSearchParams({ chat_id: chatId, text, disable_web_page_preview: 'true' }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!response.ok || !json.ok) {
      logger.warn(`Telegram recusou o alerta: ${json.description ?? response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(`Falha ao enviar alerta: ${(error as Error).message}`);
    return false;
  }
}
