import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

let browser = null;
let page = null;

async function ensureBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  if (!page) {
    page = await browser.newPage();
  }

  return page;
}

async function loginToPinterest(email, password) {
  const page = await ensureBrowser();

  await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });

  await page.type('input[name="id"]', email, { delay: 50 });
  await page.type('input[name="password"]', password, { delay: 50 });
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  return page;
}

async function createPin(page, { title, description, imageUrl, link, hashtags }) {
  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    throw new Error('Campo de upload de imagem não encontrado');
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Falha ao baixar imagem: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const tempPath = path.join('/tmp', `temp_image_${Date.now()}.jpg`);
  fs.writeFileSync(tempPath, Buffer.from(imageBuffer));

  await fileInput.uploadFile(tempPath);
  await page.waitForTimeout(2500);

  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }

  const titleInput = await page.$('input[placeholder*="Título"]');
  if (titleInput) {
    await titleInput.click({ clickCount: 3 });
    await titleInput.type(title, { delay: 30 });
  }

  const descriptionInput = await page.$('textarea[placeholder*="Descreva"]');
  if (descriptionInput) {
    await descriptionInput.click({ clickCount: 3 });
    await descriptionInput.type(description, { delay: 30 });
  }

  if (link) {
    const linkInput = await page.$('input[placeholder*="URL"]');
    if (linkInput) {
      await linkInput.click({ clickCount: 3 });
      await linkInput.type(link, { delay: 30 });
    }
  }

  if (hashtags && hashtags.length > 0 && descriptionInput) {
    await descriptionInput.type(`\n\n${hashtags.join(' ')}`, { delay: 20 });
  }

  const publishButton = await page.$('button[data-test-id="publish-button"]');
  if (!publishButton) {
    throw new Error('Botão de publicar não encontrado');
  }

  await publishButton.click();
  await page.waitForTimeout(5000);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, products } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
  }

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum produto para publicar' });
  }

  try {
    const page = await loginToPinterest(email, password);
    const results = [];

    for (const product of products) {
      try {
        await createPin(page, product);
        results.push({ id: product.id, success: true });
      } catch (innerError) {
        console.error('Erro ao criar pin para produto:', product.id, innerError);
        results.push({ id: product.id, success: false, error: innerError.message });
      }
    }

    const success = results.some((item) => item.success);
    return res.status(200).json({ success, results });
  } catch (error) {
    console.error('Erro em start-auto:', error);
    return res.status(500).json({ success: false, message: 'Erro ao iniciar automação' });
  }
}
