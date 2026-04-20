import puppeteer from 'puppeteer';

let browser = null;
let page = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
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

    await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });

    await page.type('input[name="id"]', email);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    res.status(200).json({ success: true, message: 'Login realizado com sucesso' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, message: 'Falha no login' });
  }
}