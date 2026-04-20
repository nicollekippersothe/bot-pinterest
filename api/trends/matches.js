import { TrendAnalyzer } from '../../services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const matches = await analyzer.findBestMatches();
    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('Erro ao encontrar melhores combinações:', error);
    res.status(500).json({ success: false, error: 'Erro ao encontrar melhores combinações' });
  }
}