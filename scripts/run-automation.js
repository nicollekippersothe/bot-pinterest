import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.random() * (max - min));

const email = process.env.PINTEREST_EMAIL;
const password = process.env.PINTEREST_PASSWORD;
const productsJson = process.env.PRODUCTS_JSON;
const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

if (!email || !password || !productsJson) {
  console.error('Variáveis de ambiente ausentes: PINTEREST_EMAIL, PINTEREST_PASSWORD, PRODUCTS_JSON');
  process.exit(1);
}

let products;
try {
  products = JSON.parse(productsJson);
} catch {
  console.error('PRODUCTS_JSON inválido');
  process.exit(1);
}

async function launchBrowser() {
  return puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 800 },
    executablePath: chromiumPath,
    headless: true,
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

async function loginPinterest(page) {
  console.log('Fazendo login no Pinterest...');
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
    throw new Error('Login falhou — verifique PINTEREST_EMAIL e PINTEREST_PASSWORD nos secrets');
  }
  console.log('Login OK');
}

async function createPin(page, product) {
  console.log(`Publicando: ${product.title}`);
  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2', timeout: 60000 });
  await jitter(2000, 4000);

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

  const titleSelector = 'input[placeholder*="Título"], input[placeholder*="title" i], [data-test-id="pin-draft-title"] input';
  if (await page.$(titleSelector)) {
    await typeHuman(page, titleSelector, product.title || '');
    await jitter(500, 1000);
  }

  const descSelector = 'textarea[placeholder*="Descreva"], textarea[placeholder*="description" i], [data-test-id="pin-draft-description"] textarea';
  if (await page.$(descSelector)) {
    const hashtags = product.hashtags?.length ? '\n\n' + product.hashtags.join(' ') : '';
    await typeHuman(page, descSelector, (product.description || '') + hashtags);
    await jitter(500, 1000);
  }

  if (product.link) {
    const linkSelector = 'input[placeholder*="URL"], input[placeholder*="link" i], [data-test-id="pin-draft-link"] input';
    if (await page.$(linkSelector)) {
      await typeHuman(page, linkSelector, product.link);
      await jitter(500, 1000);
    }
  }

  const publishBtn = await page.$('button[data-test-id="publish-button"], button[type="submit"][aria-label*="Publish" i]');
  if (!publishBtn) throw new Error('Botão de publicar não encontrado');

  await publishBtn.click();
  await jitter(5000, 8000);
  console.log(`Publicado: ${product.title}`);
}

async function main() {
  let browser;
  const results = [];

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

    await loginPinterest(page);

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

    const successCount = results.filter((r) => r.success).length;
    console.log(`\nResultado: ${successCount}/${products.length} pins publicados`);
    console.log(JSON.stringify(results));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length === products.length) process.exit(1);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
