import { TrendAnalyzer } from '../../services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const matches = await analyzer.findBestMatches();
    const recommendations = matches.slice(0, 5).map(match => ({
      trend: match.trend,
      topProducts: match.products.slice(0, 3),
      score: match.score
    }));

    res.json({ success: true, data: recommendations });
  } catch (error) {
    console.error('Erro ao gerar recomendações:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar recomendações' });
  }
}