export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { products } = req.body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Lista de produtos é obrigatória' });
  }

  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_REF;

  if (!pat || !repo || !ref) {
    return res.status(500).json({
      error: 'Configure GITHUB_PAT, GITHUB_REPO e GITHUB_REF nas variáveis de ambiente da Vercel',
    });
  }

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
      body: JSON.stringify({
        ref,
        inputs: { products_json: JSON.stringify(products) },
      }),
    }
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    return res.status(500).json({ success: false, error: `GitHub API: ${dispatchRes.status} — ${text}` });
  }

  // Aguarda o run aparecer na API (pode demorar ~2s)
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

  return res.status(200).json({
    success: true,
    runId: latestRun?.id,
    runUrl: latestRun?.html_url,
    message: `Job iniciado para ${products.length} pin(s)`,
  });
}
