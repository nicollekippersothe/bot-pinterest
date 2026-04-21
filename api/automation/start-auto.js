import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.random() * (max - min));

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 800 },
    executablePath,
    headless: chromium.headless,
  });
}

async function typeHuman(page, selector, text) {
  await page.focus(selector);
  await page.click(selector, { clickCount: 3 });
  for (const char of text) {
    await page.keyboard.type(char, { delay: 40 + Math.random() * 80 });
  }
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const tempPath = path.join('/tmp', `pin_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
}

async function loginPinterest(page, email, password) {
  await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2', timeout: 60000 });
  await jitter(1500, 3000);

  await typeHuman(page, 'input[name="id"]', email);
  await jitter(500, 1200);
  await typeHuman(page, 'input[name="password"]', password);
  await jitter(600, 1000);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  const url = page.url();
  if (url.includes('/login') || url.includes('/error')) {
    throw new Error('Login falhou — verifique email e senha');
  }
}

async function createPin(page, product) {
  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2', timeout: 60000 });
  await jitter(2000, 4000);

  // Upload de imagem
  if (product.imageUrl) {
    let tempPath;
    try {
      tempPath = await downloadImage(product.imageUrl);
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(tempPath);
        await jitter(3000, 5000);
      }
    } finally {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  // Título
  const titleSelector = 'input[placeholder*="Título"], input[placeholder*="title" i], [data-test-id="pin-draft-title"] input';
  const titleInput = await page.$(titleSelector);
  if (titleInput) {
    await typeHuman(page, titleSelector, product.title || '');
    await jitter(500, 1000);
  }

  // Descrição + hashtags
  const descSelector = 'textarea[placeholder*="Descreva"], textarea[placeholder*="description" i], [data-test-id="pin-draft-description"] textarea';
  const descInput = await page.$(descSelector);
  if (descInput) {
    const hashtags = product.hashtags?.length ? '\n\n' + product.hashtags.join(' ') : '';
    await typeHuman(page, descSelector, (product.description || '') + hashtags);
    await jitter(500, 1000);
  }

  // Link de destino
  if (product.link) {
    const linkSelector = 'input[placeholder*="URL"], input[placeholder*="link" i], [data-test-id="pin-draft-link"] input';
    const linkInput = await page.$(linkSelector);
    if (linkInput) {
      await typeHuman(page, linkSelector, product.link);
      await jitter(500, 1000);
    }
  }

  // Publicar
  const publishBtn = await page.$('button[data-test-id="publish-button"], button[type="submit"][aria-label*="Publish" i]');
  if (!publishBtn) throw new Error('Botão de publicar não encontrado');

  await publishBtn.click();
  await jitter(5000, 8000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, products } = req.body;

  if (!email || !password || !products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Email, senha e produtos são obrigatórios' });
  }

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });

    await loginPinterest(page, email, password);

    const results = [];
    for (const product of products) {
      try {
        await createPin(page, product);
        results.push({ id: product.id, success: true });
        await jitter(4000, 8000);
      } catch (err) {
        console.error(`Erro no pin ${product.id}:`, err.message);
        results.push({ id: product.id, success: false, error: err.message });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Erro fatal na automação:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
