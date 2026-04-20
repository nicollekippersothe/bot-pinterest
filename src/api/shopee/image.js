export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const productUrl = req.query.url || req.url.split('?url=')[1];
  const decodedUrl = typeof productUrl === 'string' ? decodeURIComponent(productUrl) : '';

  if (!decodedUrl || !decodedUrl.includes('shopee')) {
    return res.status(400).json({ success: false, message: 'URL Shopee inválida' });
  }

  try {
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`Shopee retornou status ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/<meta[^>]+property=(?:"|')og:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i)
      || html.match(/<meta[^>]+content=(?:"|')([^"']+)(?:"|')[^>]+property=(?:"|')og:image(?:"|')/i)
      || html.match(/<meta[^>]+property=(?:"|')og:image:secure_url(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i)
      || html.match(/<meta[^>]+name=(?:"|')twitter:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i);

    let imageUrl = match?.[1] || '';

    if (!imageUrl) {
      const jsonMatch = html.match(/"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp))"/i);
      imageUrl = jsonMatch?.[1] || '';
    }

    if (!imageUrl) {
      return res.status(404).json({ success: false, message: 'Não foi possível extrair a imagem do produto' });
    }

    if (imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    }

    if (!imageUrl.startsWith('http')) {
      imageUrl = `https://${imageUrl.replace(/^\/+/, '')}`;
    }

    return res.status(200).json({ success: true, imageUrl });
  } catch (error) {
    console.error('Shopee image proxy error:', error);
    return res.status(500).json({ success: false, message: 'Erro ao buscar a imagem do Shopee' });
  }
}
