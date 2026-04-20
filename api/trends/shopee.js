import { TrendAnalyzer } from '../../services/trendAnalyzer.js';

const analyzer = new TrendAnalyzer();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { keyword } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const products = await analyzer.getShopeeProductsByKeyword(keyword, limit);
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Erro ao buscar produtos Shopee:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar produtos Shopee' });
  }
}