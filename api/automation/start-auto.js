export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { products, shopeeUrl, dailyLimit } = req.body;

  const hasProducts = Array.isArray(products) && products.length > 0;
  const hasShopeeUrl = typeof shopeeUrl === 'string' && shopeeUrl.includes('shopee.com.br');

  if (!hasProducts && !hasShopeeUrl) {
    return res.status(400).json({
      error: 'Forneça uma URL do Shopee ou uma lista de produtos.',
    });
  }

  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_REF;

  if (!pat || !repo || !ref) {
    return res.status(500).json({
      error: 'Configure GITHUB_PAT, GITHUB_REPO e GITHUB_REF nas variáveis de ambiente da Vercel',
    });
  }

  const inputs = {
    daily_limit: String(dailyLimit || 5),
  };

  if (hasShopeeUrl) inputs.shopee_url = shopeeUrl;
  if (hasProducts) inputs.products_json = JSON.stringify(products);

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/pinterest-automation.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return res.status(500).json({ success: false, error: `GitHub API: ${dispatchRes.status} — ${text}` });
  }

  await new Promise((r) => setTimeout(r, 3000));

  const runsRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/pinterest-automation.yml/runs?per_page=1`,
    {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );

  const runsData = await runsRes.json();
  const latestRun = runsData.workflow_runs?.[0];

  const label = hasShopeeUrl
    ? `Buscando produtos em ${shopeeUrl} e publicando...`
    : `Job iniciado para ${products.length} pin(s)`;

  return res.status(200).json({
    success: true,
    runId: latestRun?.id,
    runUrl: latestRun?.html_url,
    message: label,
  });
}
