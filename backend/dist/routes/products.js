import express from 'express';
import { TrendAnalyzer } from '../services/trendAnalyzer.js';
const router = express.Router();
const analyzer = new TrendAnalyzer();
router.get('/recommendations', async (req, res) => {
    try {
        const matches = await analyzer.findBestMatches();
        const recommendations = matches.slice(0, 5).map(match => ({
            trend: match.trend,
            topProducts: match.products.slice(0, 3),
            score: match.score
        }));
        res.json({ success: true, data: recommendations });
    }
    catch (error) {
        res.status(500).json({ success: false, error: 'Erro ao gerar recomendações' });
    }
});
export { router as productRouter };
