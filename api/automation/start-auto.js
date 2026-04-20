import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

let browser = null;
let page = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, products } = req.body;

  if (!email || !password || !products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Email, senha e produtos são obrigatórios' });
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

    // Login no Pinterest
    await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });

    await page.type('input[name="id"]', email);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const results = [];

    // Processar cada produto
    for (const product of products) {
      try {
        // Navegar para criar pin
        await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });

        // Upload da imagem
        const fileInput = await page.$('input[type="file"]');
        if (fileInput && product.imageUrl) {
          // Download da imagem primeiro
          const imageResponse = await fetch(product.imageUrl);
          const imageBuffer = await imageResponse.arrayBuffer();
          const tempPath = path.join('/tmp', `temp_image_${Date.now()}.jpg`);
          fs.writeFileSync(tempPath, Buffer.from(imageBuffer));

          await fileInput.uploadFile(tempPath);
          await page.waitForTimeout(2000);

          // Limpar arquivo temporário
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        }

        // Preencher título
        await page.type('input[placeholder*="Título"]', product.title);

        // Preencher descrição
        await page.type('textarea[placeholder*="Descreva"]', product.description);

        // Adicionar link
        if (product.link) {
          const linkInput = await page.$('input[placeholder*="URL"]');
          if (linkInput) {
            await linkInput.type(product.link);
          }
        }

        // Adicionar hashtags na descrição
        if (product.hashtags && product.hashtags.length > 0) {
          const hashtagsText = '\n\n' + product.hashtags.join(' ');
          await page.type('textarea[placeholder*="Descreva"]', hashtagsText);
        }

        // Publicar
        const publishButton = await page.$('button[data-test-id="publish-button"]');
        if (publishButton) {
          await publishButton.click();
          await page.waitForTimeout(5000);
        }

        results.push({ id: product.id, success: true });
      } catch (error) {
        console.error(`Erro ao criar pin para produto ${product.id}:`, error);
        results.push({ id: product.id, success: false, error: error.message });
      }
    }

    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('Erro na automação:', error);
    res.status(500).json({ success: false, message: 'Erro na automação' });
  }
}