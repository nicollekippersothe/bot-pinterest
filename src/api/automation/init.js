import puppeteer from 'puppeteer';

let browser = null;
let page = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    if (!page) {
      page = await browser.newPage();
    }

    res.status(200).json({ success: true, message: 'Automação inicializada' });
  } catch (error) {
    console.error('Erro ao inicializar automação:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}