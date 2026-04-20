import puppeteer from 'puppeteer';

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

async function findSelector(page, selectors) {
  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) return selector;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const page = await ensureBrowser();
    await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });

    const emailSelector = await findSelector(page, [
      'input[name="id"]',
      'input[name="email"]',
      'input[type="email"]',
    ]);

    if (!emailSelector) {
      throw new Error('Campo de email não encontrado no Pinterest');
    }

    const passwordSelector = await findSelector(page, ['input[name="password"]']);
    if (!passwordSelector) {
      throw new Error('Campo de senha não encontrado no Pinterest');
    }

    await page.type(emailSelector, email, { delay: 50 });
    await page.type(passwordSelector, password, { delay: 50 });

    const submitButton = await findSelector(page, [
      'button[type="submit"]',
      'button[data-test-id="registerFormButton"]',
      'button[data-test-id="loginButton"]',
    ]);

    if (!submitButton) {
      throw new Error('Botão de login não encontrado no Pinterest');
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
      page.click(submitButton),
    ]);

    if (page.url().includes('/login')) {
      throw new Error('Login não avançou, talvez credenciais incorretas ou bloqueio de segurança');
    }

    res.status(200).json({ success: true, message: 'Login realizado com sucesso' });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, message: 'Falha no login', details: error.message });
  }
}