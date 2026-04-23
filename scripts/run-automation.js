import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.random() * (max - min));

const email = process.env.PINTEREST_EMAIL;
const password = process.env.PINTEREST_PASSWORD;
const chromiumPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const shopeeUrl = process.env.SHOPEE_URL || '';
const dailyLimit = parseInt(process.env.DAILY_LIMIT || '5', 10);
const affiliateId = process.env.AFFILIATE_ID || 'an_18393280814';

if (!email || !password) {
  console.error('Variáveis de ambiente ausentes: PINTEREST_EMAIL, PINTEREST_PASSWORD');
  process.exit(1);
}

const hooks = [
  'Você cansou de usar menos espaço? Esse produto resolve.',
  'Achei o produto mais útil da Shopee por menos de R$30.',
  'Não sabia que precisava disso até comprar.',
  'Por que ninguém comprou isso ainda?',
  'O achado que mudou minha cozinha.',
  'Menos de R$20 e mudou minha rotina.',
];

function buildAffiliateLink(shopid, itemid, slug) {
  return `https://shopee.com.br/${slug}-i.${shopid}.${itemid}?mmp_pid=${affiliateId}&utm_medium=affiliates&utm_source=${affiliateId}`;
}

function generateTitle(name, price) {
  const suffix = 'Achadinhos Casa & Cozinha';
  const base = `${name} por R$${price}`;
  const candidate = `${base} | ${suffix}`;
  return candidate.length <= 100 ? candidate : `${name.slice(0, 75)}... | ${suffix}`;
}

function generateDescription(name, price) {
  const base = `${name} por apenas R$${price} na Shopee. Achado de casa e cozinha com entrega rápida e qualidade.`;
  return `${base} #Achadinhos #ShopeeBrasil #CasaECozinha #Organizacao #GadgetsCozinha`.slice(0, 500);
}

function generateHook() {
  return hooks[Math.floor(Math.random() * hooks.length)];
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const tempPath = path.join('/tmp', `pin_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  fs.writeFileSync(tempPath, Buffer.from(buffer));
  return tempPath;
}

async function scrapeShopee(browser, url) {
  console.log(`Buscando produtos em: ${url}`);
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('a[href*="-i."]', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => window.scrollBy(0, 1000));
    await sleep(2500);

    const scraped = await page.evaluate((affId) => {
      const results = [];
      const seen = new Set();
      const links = document.querySelectorAll('a[href*="-i."]');

      for (const link of links) {
        const href = link.href || '';
        const match = href.match(/\/([^/?]+)-i\.(\d+)\.(\d+)/);
        if (!match) continue;

        const slug = match[1];
        const shopid = match[2];
        const itemid = match[3];
        const key = `${shopid}.${itemid}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const card = link.closest('li, [data-sqe]') || link.parentElement?.parentElement;
        const nameEl = card?.querySelector('[class*="title"], [class*="name"], [class*="label"]');
        const name = nameEl?.textContent?.trim() || slug.replace(/-/g, ' ');

        const allText = card?.textContent || '';
        const priceMatches = [...allText.matchAll(/R\$\s*([\d]+[.,][\d]{2})/g)];
        const prices = priceMatches.map(m => parseFloat(m[1].replace(',', '.')));
        const price = prices.length ? Math.min(...prices) : 0;

        const img = card?.querySelector('img');
        let imageUrl = img?.src || img?.getAttribute('data-src') || '';
        if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;

        const affiliateLink = `https://shopee.com.br/${slug}-i.${shopid}.${itemid}?mmp_pid=${affId}&utm_medium=affiliates&utm_source=${affId}`;

        if (name && price > 0) {
          results.push({ shopid, itemid, slug, name, price, imageUrl, affiliateLink });
        }
        if (results.length >= 20) break;
      }
      return results;
    }, affiliateId);

    console.log(`Encontrados ${scraped.length} produtos no Shopee`);
    return scraped;
  } finally {
    await page.close().catch(() => {});
  }
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
    const desc = (product.description || '') + '\n\n' + (product.hashtags?.join(' ') || '');
    await typeHuman(page, descSelector, desc);
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
  let products = [];

  // Se vier URL do Shopee, scrapa os produtos primeiro
  if (shopeeUrl) {
    const browser = await launchBrowser();
    try {
      const scraped = await scrapeShopee(browser, shopeeUrl);
      products = scraped.slice(0, dailyLimit).map((p) => ({
        id: `shopee_${p.shopid}_${p.itemid}`,
        title: generateTitle(p.name, p.price.toFixed(2).replace('.', ',')),
        description: generateDescription(p.name, p.price.toFixed(2).replace('.', ',')),
        hook: generateHook(),
        hashtags: ['#Achadinhos', '#ShopeeBrasil', '#CasaECozinha', '#Organizacao'],
        imageUrl: p.imageUrl || 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&h=800&fit=crop',
        link: p.affiliateLink,
      }));
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // Produtos enviados manualmente via PRODUCTS_JSON complementam ou substituem
  if (process.env.PRODUCTS_JSON) {
    try {
      const manual = JSON.parse(process.env.PRODUCTS_JSON);
      if (Array.isArray(manual) && manual.length > 0) {
        products = [...manual, ...products].slice(0, dailyLimit);
      }
    } catch {
      console.warn('PRODUCTS_JSON inválido, ignorando.');
    }
  }

  if (products.length === 0) {
    console.error('Nenhum produto para publicar. Forneça SHOPEE_URL ou PRODUCTS_JSON.');
    process.exit(1);
  }

  console.log(`\nPublicando ${products.length} pin(s) no Pinterest...`);

  const browser = await launchBrowser();
  const results = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
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
    await browser.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length === products.length) process.exit(1);
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
