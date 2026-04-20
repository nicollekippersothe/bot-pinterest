export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Products deve ser um array' });
    }

    // Processar produtos do feed
    const processedProducts = products
      .filter(product => product.name && product.price >= 15 && product.price <= 55)
      .map(product => ({
        id: `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: product.name,
        price: product.price,
        image: product.image || '',
        link: product.link || '',
        rating: product.rating || 0,
        soldCount: product.soldCount || 0,
        category: product.category || 'geral',
        affiliateLink: product.affiliateLink || product.link // Usar affiliateLink se disponível
      }));

    res.status(200).json({
      success: true,
      data: processedProducts,
      message: `${processedProducts.length} produtos processados`
    });

  } catch (error) {
    console.error('Erro ao processar feed:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
}