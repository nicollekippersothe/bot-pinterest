import { TrendAnalyzer } from '../../../backend/src/services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const matches = await analyzer.findBestMatches();
    res.status(200).json({ success: true, data: matches });
  } catch (error) {
    console.error('Erro ao buscar matches:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}