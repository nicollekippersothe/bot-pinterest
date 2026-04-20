import express from 'express';
import { TrendAnalyzer } from '../services/trendAnalyzer.js';

const router = express.Router();
const analyzer = new TrendAnalyzer();

router.get('/pinterest', async (req, res) => {
  try {
    const trends = await analyzer.getPinterestTrends();
    res.json({ success: true, data: trends });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar tendências Pinterest' });
  }
});

router.get('/shopee/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const products = await analyzer.getShopeeProductsByKeyword(keyword, limit);
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar produtos Shopee' });
  }
});

router.get('/matches', async (req, res) => {
  try {
    const matches = await analyzer.findBestMatches();
    res.json({ success: true, data: matches });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao encontrar melhores combinações' });
  }
});

export { router as trendRouter };