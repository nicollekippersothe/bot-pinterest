import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';

puppeteer.use(StealthPlugin());

const AFFILIATE_ID = 'an_18393280814';

function buildAffiliateLink(shopid, itemid, slug) {
  const name = slug || 'produto';
  return `https://shopee.com.br/${name}-i.${shopid}.${itemid}?mmp_pid=${AFFILIATE_ID}&utm_medium=affiliates&utm_source=${AFFILIATE_ID}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query.url ? decodeURIComponent(req.query.url) : '';

  if (!url || !url.includes('shopee.com.br')) {
    return res.status(400).json({ error: 'Cole uma URL de busca válida do Shopee (shopee.com.br/search?keyword=...)' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: { width: 1280, height: 900 },
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // Aguarda os cards de produto aparecerem
    await page.waitForSelector('a[href*="-i."]', { timeout: 15000 }).catch(() => {});

    // Scroll para carregar mais produtos
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate((affiliateId) => {
      const results = [];
      const seen = new Set();

      // Pega todos os links de produto (formato: /nome-i.shopid.itemid)
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

        // Busca o container do card a partir do link
        const card = link.closest('li, [data-sqe]') || link.parentElement?.parentElement;

        // Nome
        const nameEl = card?.querySelector('[class*="title"], [class*="name"], [class*="label"]');
        const name = nameEl?.textContent?.trim() || slug.replace(/-/g, ' ');

        // Preço — busca o menor número com R$
        const allText = card?.textContent || '';
        const priceMatches = [...allText.matchAll(/R\$\s*([\d]+[.,][\d]{2})/g)];
        const prices = priceMatches.map(m => parseFloat(m[1].replace(',', '.')));
        const price = prices.length ? Math.min(...prices) : 0;

        // Imagem
        const img = card?.querySelector('img');
        let imageUrl = img?.src || img?.getAttribute('data-src') || '';
        if (imageUrl.startsWith('//')) imageUrl = `https:${imageUrl}`;

        // Monta link de afiliado
        const affiliateLink = `https://shopee.com.br/${slug}-i.${shopid}.${itemid}?mmp_pid=${affiliateId}&utm_medium=affiliates&utm_source=${affiliateId}`;

        if (name && price > 0) {
          results.push({ shopid, itemid, slug, name, price, imageUrl, affiliateLink });
        }

        if (results.length >= 20) break;
      }

      return results;
    }, AFFILIATE_ID);

    if (products.length === 0) {
      return res.status(422).json({ error: 'Nenhum produto encontrado. Tente com outra URL de busca.' });
    }

    return res.status(200).json({ success: true, count: products.length, products });
  } catch (err) {
    console.error('Shopee search error:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar produtos. Tente novamente.' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
