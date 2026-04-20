import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

let browser = null;
let page = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, description, imageUrl, link, hashtags } = req.body;

  if (!title || !description || !imageUrl) {
    return res.status(400).json({ error: 'Título, descrição e imagem são obrigatórios' });
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

    // Navegar para criar pin
    await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });

    // Upload da imagem
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      // Download da imagem primeiro
      const imageResponse = await fetch(imageUrl);
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
    await page.type('input[placeholder*="Título"]', title);

    // Preencher descrição
    await page.type('textarea[placeholder*="Descreva"]', description);

    // Adicionar link
    if (link) {
      const linkInput = await page.$('input[placeholder*="URL"]');
      if (linkInput) {
        await linkInput.type(link);
      }
    }

    // Adicionar hashtags na descrição
    if (hashtags && hashtags.length > 0) {
      const hashtagsText = '\n\n' + hashtags.join(' ');
      await page.type('textarea[placeholder*="Descreva"]', hashtagsText);
    }

    // Publicar
    const publishButton = await page.$('button[data-test-id="publish-button"]');
    if (publishButton) {
      await publishButton.click();
      await page.waitForTimeout(5000);
    }

    res.status(200).json({ success: true, message: 'Pin criado com sucesso' });
  } catch (error) {
    console.error('Erro ao criar pin:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar pin' });
  }
}