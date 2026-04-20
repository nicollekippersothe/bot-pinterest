import { TrendAnalyzer } from '../../backend/src/services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const trends = await analyzer.getPinterestTrends();
    res.status(200).json({ success: true, data: trends });
  } catch (error) {
    console.error('Erro ao buscar tendências:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}