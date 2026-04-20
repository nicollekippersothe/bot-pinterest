import express from 'express';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
const router = express.Router();
class PinterestAutomation {
    browser = null;
    page = null;
    async init() {
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
    }
    async login(email, password) {
        try {
            await this.page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });
            await this.page.type('input[name="id"]', email);
            await this.page.type('input[name="password"]', password);
            await this.page.click('button[type="submit"]');
            await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
            return true;
        }
        catch (error) {
            console.error('Erro no login:', error);
            return false;
        }
    }
    async createPin(pinData) {
        try {
            // Navegar para criar pin
            await this.page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });
            // Upload da imagem
            let tempPath;
            const fileInput = await this.page.$('input[type="file"]');
            if (fileInput) {
                // Download da imagem primeiro
                const imageResponse = await fetch(pinData.imageUrl);
                const imageBuffer = await imageResponse.arrayBuffer();
                tempPath = path.join(process.cwd(), 'temp_image.jpg');
                fs.writeFileSync(tempPath, Buffer.from(imageBuffer));
                await fileInput.uploadFile(tempPath);
                await this.page.waitForTimeout(2000);
            }
            // Preencher título
            await this.page.type('input[placeholder*="Título"]', pinData.title);
            // Preencher descrição
            await this.page.type('textarea[placeholder*="Descreva"]', pinData.description);
            // Adicionar link
            const linkInput = await this.page.$('input[placeholder*="URL"]');
            if (linkInput) {
                await linkInput.type(pinData.link);
            }
            // Adicionar hashtags na descrição
            const hashtagsText = '\n\n' + pinData.hashtags.join(' ');
            await this.page.type('textarea[placeholder*="Descreva"]', hashtagsText);
            // Publicar
            const publishButton = await this.page.$('button[data-test-id="publish-button"]');
            if (publishButton) {
                await publishButton.click();
                await this.page.waitForTimeout(5000);
            }
            // Limpar arquivo temporário
            if (tempPath && fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
            return true;
        }
        catch (error) {
            console.error('Erro ao criar pin:', error);
            return false;
        }
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
const automation = new PinterestAutomation();
// Inicializar automação
router.post('/init', async (req, res) => {
    try {
        await automation.init();
        res.json({ success: true, message: 'Automação inicializada' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao inicializar automação' });
    }
});
// Login no Pinterest
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const success = await automation.login(email, password);
        res.json({ success, message: success ? 'Login realizado' : 'Falha no login' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Erro no login' });
    }
});
// Criar pin automaticamente
router.post('/create-pin', async (req, res) => {
    try {
        const pinData = req.body;
        const success = await automation.createPin(pinData);
        res.json({ success, message: success ? 'Pin criado' : 'Falha ao criar pin' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao criar pin' });
    }
});
// Fechar automação
router.post('/close', async (req, res) => {
    try {
        await automation.close();
        res.json({ success: true, message: 'Automação fechada' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao fechar automação' });
    }
});
export { router as automationRouter, PinterestAutomation };
