import { TrendAnalyzer } from '../../../backend/src/services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { keyword } = req.query;
  const limit = parseInt(req.query.limit) || 20;

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword é obrigatório' });
  }

  try {
    const products = await analyzer.getShopeeProductsByKeyword(keyword, limit);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}