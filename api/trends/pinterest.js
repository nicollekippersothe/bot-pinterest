import { TrendAnalyzer } from '../../services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const trends = await analyzer.getPinterestTrends();
    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Erro ao buscar tendências Pinterest:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar tendências Pinterest' });
  }
}