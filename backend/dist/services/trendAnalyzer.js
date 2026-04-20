import axios from 'axios';
import * as cheerio from 'cheerio';
class TrendAnalyzer {
    PINTEREST_TRENDS_URL = 'https://trends.pinterest.com/trending/';
    SHOPEE_SEARCH_URL = 'https://shopee.com.br/search';
    async getPinterestTrends() {
        try {
            // Simulação - em produção usaria Pinterest API
            const mockTrends = [
                { keyword: 'organização cozinha', volume: 125000, category: 'casa', growth: 15 },
                { keyword: 'gadgets cozinha', volume: 98000, category: 'casa', growth: 22 },
                { keyword: 'iluminação led', volume: 156000, category: 'casa', growth: 18 },
                { keyword: 'limpeza inteligente', volume: 87000, category: 'casa', growth: 12 },
                { keyword: 'acessorios airfryer', volume: 134000, category: 'casa', growth: 25 }
            ];
            return mockTrends;
        }
        catch (error) {
            console.error('Erro ao buscar tendências Pinterest:', error);
            return [];
        }
    }
    async getShopeeProductsByKeyword(keyword, limit = 20) {
        try {
            const searchUrl = `${this.SHOPEE_SEARCH_URL}?keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
            // Usando proxy para evitar CORS
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`;
            const response = await axios.get(proxyUrl, { timeout: 10000 });
            const $ = cheerio.load(response.data);
            const products = [];
            // Seletor CSS para produtos Shopee (pode precisar ajuste)
            $('.item-listing__item').each((index, element) => {
                if (index >= limit)
                    return false;
                const $el = $(element);
                const name = $el.find('.item-title').text().trim();
                const priceText = $el.find('.item-price').text().trim();
                const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                const image = $el.find('img').attr('src') || '';
                const link = $el.find('a').attr('href') || '';
                const rating = parseFloat($el.find('.rating-stars').attr('data-rating') || '0');
                const soldText = $el.find('.sold-count').text().trim();
                const soldCount = parseInt(soldText.replace(/\D/g, '')) || 0;
                if (name && price >= 15 && price <= 55) {
                    products.push({
                        id: `shopee_${Date.now()}_${index}`,
                        name,
                        price,
                        image,
                        link: link.startsWith('http') ? link : `https://shopee.com.br${link}`,
                        rating,
                        soldCount,
                        category: keyword,
                        affiliateLink: this.generateAffiliateLink(link)
                    });
                }
            });
            return products;
        }
        catch (error) {
            console.error(`Erro ao buscar produtos Shopee para "${keyword}":`, error);
            return [];
        }
    }
    generateAffiliateLink(originalLink) {
        // Em produção, implementar lógica real de afiliado Shopee
        // Por enquanto, retorna o link original
        return originalLink;
    }
    async findBestMatches() {
        const trends = await this.getPinterestTrends();
        const matches = [];
        for (const trend of trends) {
            const products = await this.getShopeeProductsByKeyword(trend.keyword, 10);
            // Calcular score baseado em volume de busca, crescimento e performance dos produtos
            const avgRating = products.reduce((sum, p) => sum + p.rating, 0) / products.length || 0;
            const avgSold = products.reduce((sum, p) => sum + p.soldCount, 0) / products.length || 0;
            const score = (trend.volume * 0.4) + (trend.growth * 0.3) + (avgRating * 20) + (avgSold * 0.1);
            matches.push({
                trend,
                products,
                score
            });
        }
        // Ordenar por score decrescente
        return matches.sort((a, b) => b.score - a.score);
    }
}
export { TrendAnalyzer };
