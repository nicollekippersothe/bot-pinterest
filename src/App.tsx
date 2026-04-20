import { useEffect, useMemo, useState } from 'react';

type PinStatus = 'pendente' | 'agendado' | 'publicado';

type Product = {
  id: string;
  productLink: string;
  affiliateLink: string;
  name: string;
  price: string;
  imageUrl: string;
  title: string;
  description: string;
  hook: string;
  hashtags: string[];
  cta: string;
  note: string;
  status: PinStatus;
  schedule: string;
};

type TrendMatch = {
  trend: {
    keyword: string;
    volume: number;
    category: string;
    growth: number;
  };
  products: Array<{
    id: string;
    name: string;
    price: number;
    image: string;
    link: string;
    rating: number;
    soldCount: number;
    category: string;
    affiliateLink: string;
  }>;
  score: number;
};

const initialProducts: Product[] = [];
const scheduleDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const scheduleTimes = ['08:00', '12:00', '18:00', '21:00'];

const hooks = [
  'Você cansou de [problema]? Esse produto resolve em 3 segundos.',
  'Achei o produto mais útil da Shopee por menos de R$30.',
  'Não sabia que precisava disso até comprar.',
  'Por que ninguém comprou isso ainda?',
];

const hotCategories = [
  'Mini gadgets de cozinha',
  'Organização visual',
  'Limpeza inteligente',
  'Iluminação LED',
  'Acessórios de Air Fryer',
  'Utensílios de silicone coloridos',
];

const keywords = [
  'achadinhos',
  'casa e cozinha',
  'organização',
  'utilidades domésticas',
  'promoção Shopee',
  'casa prática',
  'decoração funcional',
  'gadgets de cozinha',
  'economia',
  'sugestão de presente',
];

const STORAGE_KEY = 'bot-pinterest-produtos';
const BACKEND_URL = '/api';

function generateSeoTitle(name: string, price: string) {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const suffix = 'Achadinhos Casa & Cozinha';
  const base = `${cleanName} por ${price}`;
  const candidate = `${base} | ${suffix}`;
  return candidate.length <= 100 ? candidate : `${cleanName.slice(0, 80)}... | ${suffix}`;
}

function generateDescription(name: string, price: string) {
  const base = `${name} por apenas ${price} na Shopee. Aproveite este achado de casa e cozinha com entrega rápida e qualidade. Ideal para quem busca praticidade, organização e estilo sem gastar muito.`;
  const selected = keywords.slice(0, 5).join(', ');
  const full = `${base} ${selected}. Use o link de afiliado para comprar agora.`;
  return full.slice(0, 500);
}

function generateHook(name: string) {
  const productHook = hooks[Math.floor(Math.random() * hooks.length)];
  const problem = 'usar menos espaço e ter mais praticidade';
  return productHook.replace('[problema]', problem).slice(0, 100);
}

function generateHashtags(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const top = normalized
    .split(' ')
    .filter((word) => word.length > 3)
    .slice(0, 3)
    .map((tag) => `#${tag}`);
  const extras = ['#Achadinhos', '#ShopeeBrasil', '#CasaECo', '#Organizacao'].slice(0, 5 - top.length);
  return [...top, ...extras];
}

function generateCta(link: string) {
  const affLink = link.includes('shopee') ? `${link}` : link;
  return `Veja o produto na Shopee e aproveite o link de afiliada: ${affLink}`;
}

function scheduleProduct(index: number) {
  const day = scheduleDays[index % scheduleDays.length];
  const time = scheduleTimes[Math.floor(index / scheduleDays.length) % scheduleTimes.length];
  return `${day} às ${time}`;
}

function toCsv(products: Product[]) {
  const headers = ['Título', 'Descrição', 'Link', 'Link Afiliado', 'Imagem', 'Agenda', 'Status'];
  const rows = products.map((product) => [
    product.title,
    product.description,
    product.productLink,
    product.affiliateLink,
    product.imageUrl,
    product.schedule,
    product.status,
  ]);
  const escaped = rows
    .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `${headers.join(',')}\n${escaped}`;
}

function formatPrice(value: string) {
  const cleaned = value.replace(/[^0-9,\.]/g, '').replace(/\./g, ',');
  return cleaned || 'R$0,00';
}

export default function App() {
  const [productLink, setProductLink] = useState('');
  const [affiliateLink, setAffiliateLink] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('R$15,00');
  const [imageUrl, setImageUrl] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<PinStatus>('pendente');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loadingImage, setLoadingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [trendMatches, setTrendMatches] = useState<TrendMatch[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [pinterestEmail, setPinterestEmail] = useState('');
  const [pinterestPassword, setPinterestPassword] = useState('');
  const [uploadedProducts, setUploadedProducts] = useState<Array<{
    id: string;
    name: string;
    price: number;
    image: string;
    link: string;
    affiliateLink: string;
    rating: number;
    soldCount: number;
    category: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [automationStatus, setAutomationStatus] = useState('');
  const [dailyLimit, setDailyLimit] = useState(3);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProducts(JSON.parse(stored));
      } catch {
        setProducts([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }, [products]);

  const productPreview = useMemo(() => {
    if (!name) return null;
    const link = affiliateLink || productLink;
    return {
      title: generateSeoTitle(name, price),
      description: generateDescription(name, price),
      hook: generateHook(name),
      hashtags: generateHashtags(name),
      cta: generateCta(link),
    };
  }, [name, price, productLink, affiliateLink]);

  const pendingCount = products.filter((product) => product.status === 'pendente').length;
  const todayPublishCount = Math.min(pendingCount, dailyLimit);

  const addProduct = () => {
    if (!productLink || !name || !price) {
      setErrorMessage('Preencha link, nome e preço para gerar o pin.');
      return;
    }

    const linkForCta = affiliateLink || productLink;
    const newProduct: Product = {
      id: crypto.randomUUID(),
      productLink,
      affiliateLink,
      name,
      price: formatPrice(price),
      imageUrl,
      title: generateSeoTitle(name, price),
      description: generateDescription(name, price),
      hook: generateHook(name),
      hashtags: generateHashtags(name),
      cta: generateCta(linkForCta),
      note,
      status,
      schedule: scheduleProduct(products.length),
    };

    setProducts([newProduct, ...products]);
    setProductLink('');
    setAffiliateLink('');
    setName('');
    setPrice('R$15,00');
    setImageUrl('');
    setNote('');
    setStatus('pendente');
    setErrorMessage('');
  };

  const copyAll = () => {
    const text = products
      .map((product) => [
        `Título: ${product.title}`,
        `Descrição: ${product.description}`,
        `Hook: ${product.hook}`,
        `Hashtags: ${product.hashtags.join(' ')}`,
        `CTA: ${product.cta}`,
        `Imagem: ${product.imageUrl}`,
        `Agenda: ${product.schedule}`,
        `Status: ${product.status}`,
        '---',
      ].join('\n'))
      .join('\n');

    navigator.clipboard.writeText(text);
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(products)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'pinterest-shopee.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchShopeeImage = async () => {
    if (!productLink.includes('shopee')) {
      setErrorMessage('Cole um link Shopee válido para buscar imagem.');
      return;
    }

    setErrorMessage('');
    setLoadingImage(true);

    try {
      const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(productLink)}`;
      const response = await fetch(corsUrl);
      const html = await response.text();
      const match = html.match(/<meta[^>]+property=(?:"|')og:image(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')/i)
        || html.match(/<meta[^>]+content=(?:"|')([^"']+)(?:"|')[^>]+property=(?:"|')og:image(?:"|')[^>]+/i);
      if (match?.[1]) {
        setImageUrl(match[1]);
      } else {
        setErrorMessage('Não foi possível extrair a imagem automaticamente. Cole a URL da imagem manualmente.');
      }
    } catch (error) {
      setErrorMessage('Erro ao buscar imagem do Shopee. Verifique conexão ou tente inserir a URL manualmente.');
    } finally {
      setLoadingImage(false);
    }
  };

  const fetchTrendMatches = async () => {
    setLoadingTrends(true);
    try {
      const response = await fetch(`${BACKEND_URL}/trends/matches`);
      const data = await response.json();
      if (data.success) {
        setTrendMatches(data.data);
      } else {
        setErrorMessage('Erro ao buscar tendências.');
      }
    } catch (error) {
      setErrorMessage('Erro de conexão com o backend.');
    } finally {
      setLoadingTrends(false);
    }
  };

  const addFromTrend = (product: any, trend: any) => {
    const productLink = product.affiliateLink || product.link || '';
    const newProduct: Product = {
      id: crypto.randomUUID(),
      productLink,
      affiliateLink: product.affiliateLink || product.link || '',
      name: product.name,
      price: `R$${product.price.toFixed(2).replace('.', ',')}`,
      imageUrl: product.image,
      title: generateSeoTitle(product.name, `R$${product.price}`),
      description: generateDescription(product.name, `R$${product.price}`),
      hook: generateHook(product.name),
      hashtags: generateHashtags(product.name),
      cta: generateCta(productLink),
      note: `Tendência: ${trend.keyword} (Score: ${Math.round(trend.volume * 0.4 + trend.growth * 0.3)})`,
      status: 'pendente',
      schedule: scheduleProduct(products.length),
    };

    setProducts([newProduct, ...products]);
  };

  const initAutomation = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/automation/init`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        setAutomationStatus('Automação inicializada');
      }
    } catch (error) {
      setAutomationStatus('Erro ao inicializar automação');
    }
  };

  const loginPinterest = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/automation/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pinterestEmail, password: pinterestPassword }),
      });
      const data = await response.json();
      setAutomationStatus(data.success ? 'Login realizado com sucesso' : 'Falha no login');
    } catch (error) {
      setAutomationStatus('Erro no login');
    }
  };

  const startAutoPosting = async () => {
    try {
      if (!pinterestEmail || !pinterestPassword) {
        setAutomationStatus('Informe email e senha do Pinterest antes de iniciar.');
        return;
      }

      const pendingProducts = products.filter((product) => product.status === 'pendente');
      if (pendingProducts.length === 0) {
        setAutomationStatus('Nenhum produto pendente para publicar.');
        return;
      }

      const productsToPublish = pendingProducts.slice(0, dailyLimit);
      if (pendingProducts.length > dailyLimit) {
        setAutomationStatus(`Limite diário de ${dailyLimit} posts. Serão enviados apenas ${productsToPublish.length} hoje.`);
      }

      const response = await fetch(`${BACKEND_URL}/automation/start-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pinterestEmail,
          password: pinterestPassword,
          products: productsToPublish.map((product) => ({
            id: product.id,
            title: product.title,
            description: product.description,
            imageUrl: product.imageUrl,
            link: product.affiliateLink || product.productLink,
            hashtags: product.hashtags,
          })),
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAutomationStatus('Postagem automática ativada');
        const completedIds = data.results?.filter((item: any) => item.success).map((item: any) => item.id) || [];
        setProducts(products.map((product) =>
          completedIds.includes(product.id) ? { ...product, status: 'publicado' } : product
        ));
      } else {
        setAutomationStatus(data.message || 'Erro ao ativar automação');
      }
    } catch (error) {
      console.error('Erro startAutoPosting:', error);
      setAutomationStatus('Erro na automação');
    }
  };

  const updateProductStatus = (id: string, newStatus: PinStatus) => {
    setProducts(products.map((product) => (product.id === id ? { ...product, status: newStatus } : product)));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const text = await file.text();
      let parsedProducts: any[] = [];

      if (file.name.endsWith('.csv')) {
        // Parse CSV
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        parsedProducts = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const product: any = {};

          headers.forEach((header, index) => {
            const value = values[index] || '';
            switch (header) {
              case 'nome':
              case 'name':
              case 'titulo':
              case 'title':
                product.name = value;
                break;
              case 'preco':
              case 'price':
              case 'valor':
                product.price = parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                break;
              case 'imagem':
              case 'image':
              case 'foto':
              case 'photo':
                product.image = value;
                break;
              case 'link':
              case 'url':
                product.link = value;
                break;
              case 'affiliate':
              case 'affiliate_link':
              case 'affiliateLink':
              case 'link_afiliado':
              case 'linkafiliado':
                product.affiliateLink = value;
                break;
              case 'avaliacao':
              case 'rating':
              case 'nota':
                product.rating = parseFloat(value) || 0;
                break;
              case 'vendidos':
              case 'sold':
              case 'vendas':
                product.soldCount = parseInt(value.replace(/\D/g, '')) || 0;
                break;
              case 'categoria':
              case 'category':
                product.category = value;
                break;
            }
          });

          return product;
        });
      } else if (file.name.endsWith('.json')) {
        // Parse JSON
        const jsonData = JSON.parse(text);
        parsedProducts = Array.isArray(jsonData) ? jsonData : [jsonData];
      }

      // Filtrar e validar produtos
      const validProducts = parsedProducts
        .filter(product => product.name && product.price >= 15 && product.price <= 55)
        .map(product => ({
          id: `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: product.name || '',
          price: product.price || 0,
          image: product.image || '',
          link: product.link || '',
          affiliateLink: product.affiliateLink || product.link || '',
          rating: product.rating || 0,
          soldCount: product.soldCount || 0,
          category: product.category || 'geral',
        }));

      setUploadedProducts(validProducts);
      setErrorMessage(`✅ ${validProducts.length} produtos carregados com sucesso!`);

    } catch (error) {
      setErrorMessage('❌ Erro ao processar arquivo. Verifique o formato (CSV ou JSON).');
      console.error('Erro no upload:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const addFromFeed = (product: any) => {
    // Imagem padrão se não tiver no CSV
    const defaultPlaceholder = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop';
    
const productLink = product.affiliateLink || product.link;
      const newProduct: Product = {
        id: crypto.randomUUID(),
        productLink,
        affiliateLink: product.affiliateLink || product.link,
        name: product.name,
        price: `R$${product.price.toFixed(2).replace('.', ',')}`,
        imageUrl: product.image && product.image.trim() ? product.image : defaultPlaceholder,
        title: generateSeoTitle(product.name, `R$${product.price}`),
        description: generateDescription(product.name, `R$${product.price}`),
        hook: generateHook(product.name),
        hashtags: generateHashtags(product.name),
        cta: generateCta(productLink),
      note: `Feed: ${product.category} | Rating: ${product.rating}⭐ | Vendidos: ${product.soldCount}`,
      status: 'pendente',
      schedule: scheduleProduct(products.length),
    };

    setProducts([newProduct, ...products]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-slate-800/70 bg-slate-900/90 p-6 shadow-glow backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/80">Bot Shopee → Pinterest</p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Afiliada Shopee: conteúdo automático</h1>
              <p className="mt-3 max-w-2xl text-slate-400">
                Bot inteligente analisa tendências Pinterest, encontra produtos Shopee perfeitos e publica automaticamente nos melhores horários. Score-based matching para máxima conversão.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:w-[420px]">
              <div className="rounded-3xl border border-slate-800/70 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Modo Atual</p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => setAutoMode(false)}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      !autoMode ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700/90 text-slate-100'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    onClick={() => setAutoMode(true)}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      autoMode ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700/90 text-slate-100'
                    }`}
                  >
                    Automático
                  </button>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-800/70 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Status Bot</p>
                <p className="mt-3 text-sm text-slate-300">{automationStatus || 'Aguardando configuração'}</p>
              </div>
            </div>
          </div>
        </header>

        {autoMode ? (
          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">🤖 Modo Automático</h2>
                  <p className="mt-2 text-slate-400">Configure o bot para analisar tendências e publicar automaticamente.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={fetchTrendMatches} disabled={loadingTrends} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
                    {loadingTrends ? 'Analisando...' : 'Analisar Tendências'}
                  </button>
                  <button onClick={startAutoPosting} className="rounded-2xl border border-slate-700/90 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-400">
                    Ativar Auto-posting
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-slate-800/70 bg-slate-950/80 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Limite diário</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-300">Máximo de posts por dia: <strong>{dailyLimit}</strong></p>
                  <p className="text-sm text-slate-300">Pins pendentes: <strong>{pendingCount}</strong></p>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-3 text-sm text-slate-300">
                    <span>Limite diário:</span>
                    <input
                      type="number"
                      min={1}
                      value={dailyLimit}
                      onChange={(event) => setDailyLimit(Math.max(1, parseInt(event.target.value) || 1))}
                      className="w-24 rounded-3xl border border-slate-700/80 bg-slate-950 px-3 py-2 text-slate-100 outline-none transition focus:border-cyan-500"
                    />
                  </label>
                  <p className="text-xs text-slate-500">Serão postados até {todayPublishCount} pins hoje.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-300">
                    Email Pinterest
                    <input
                      value={pinterestEmail}
                      onChange={(event) => setPinterestEmail(event.target.value)}
                      placeholder="seu@email.com"
                      className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    Senha Pinterest
                    <input
                      type="password"
                      value={pinterestPassword}
                      onChange={(event) => setPinterestPassword(event.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                    />
                  </label>
                </div>
                <div className="flex gap-3">
                  <button onClick={initAutomation} className="rounded-3xl bg-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-600">
                    Inicializar Bot
                  </button>
                  <button onClick={loginPinterest} className="rounded-3xl bg-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-600">
                    Fazer Login
                  </button>
                </div>
              </div>

              {trendMatches.length > 0 && (
                <div className="mt-6 space-y-4">
                  <h3 className="text-lg font-semibold text-white">🎯 Melhores Matches Encontrados</h3>
                  {trendMatches.slice(0, 3).map((match, index) => (
                    <div key={index} className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-cyan-300">#{index + 1} - {match.trend.keyword}</p>
                          <p className="text-sm text-slate-400">Volume: {match.trend.volume.toLocaleString()} | Crescimento: +{match.trend.growth}% | Score: {Math.round(match.score)}</p>
                        </div>
                        <button
                          onClick={() => addFromTrend(match.products[0], match.trend)}
                          className="rounded-2xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                        >
                          Usar este produto
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {match.products.slice(0, 3).map((product, pIndex) => (
                          <div key={pIndex} className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-3">
                            <img src={product.image} alt={product.name} className="w-full h-20 object-cover rounded-xl mb-2" />
                            <p className="text-xs font-semibold text-slate-100 truncate">{product.name}</p>
                            <p className="text-xs text-cyan-300">R${product.price} | ⭐{product.rating}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
                <h2 className="text-lg font-semibold text-white">📊 Lógica do Bot</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex justify-between">
                    <span>Volume Pinterest</span>
                    <span className="text-cyan-300">40%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Crescimento tendência</span>
                    <span className="text-cyan-300">30%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rating produto</span>
                    <span className="text-cyan-300">20%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vendas Shopee</span>
                    <span className="text-cyan-300">10%</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-400">Score = Soma ponderada dos fatores acima</p>
              </div>

              <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
                <h2 className="text-lg font-semibold text-white">⏰ Agendamento</h2>
                <p className="mt-2 text-slate-400">Horários de pico automáticos.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {scheduleTimes.map((time) => (
                    <div key={time} className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4 text-center">
                      <p className="font-semibold text-slate-100">{time}</p>
                      <p className="mt-2 text-sm text-slate-400">Diariamente</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Gerador de Pin</h2>
                  <p className="mt-2 text-slate-400">Insira o produto Shopee e gere todas as informações do Pin imediatamente.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyAll} className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Copiar tudo</button>
                  <button onClick={exportCsv} className="rounded-2xl border border-slate-700/90 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-400">Exportar CSV</button>
                </div>
              </div>

              {/* Upload de Feed */}
              <div className="mt-6 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">📁 Upload de Feed Shopee</h3>
                    <p className="mt-1 text-sm text-slate-400">Faça upload de arquivo CSV ou JSON com seus produtos para processamento em lote.</p>
                  </div>
                  <label className="cursor-pointer rounded-2xl bg-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-600">
                    {isUploading ? 'Processando...' : 'Escolher arquivo'}
                    <input
                      type="file"
                      accept=".csv,.json"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadedProducts.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-cyan-300 mb-3">📦 {uploadedProducts.length} produtos carregados</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {uploadedProducts.slice(0, 6).map((product) => (
                        <div key={product.id} className="rounded-2xl border border-slate-700/50 bg-slate-900/50 p-3">
                          <img 
                            src={product.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop'} 
                            alt={product.name} 
                            className="w-full h-20 object-cover rounded-xl mb-2 bg-slate-800"
                            onError={(e: any) => {
                              e.target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop';
                            }}
                          />
                          <p className="text-xs font-semibold text-slate-100 truncate">{product.name}</p>
                          <p className="text-xs text-cyan-300">R${product.price} | ⭐{product.rating}</p>
                          <button
                            onClick={() => addFromFeed(product)}
                            className="mt-2 w-full rounded-xl bg-cyan-500 px-2 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                          >
                            Usar produto
                          </button>
                        </div>
                      ))}
                    </div>
                    {uploadedProducts.length > 6 && (
                      <p className="mt-3 text-xs text-slate-400">... e mais {uploadedProducts.length - 6} produtos</p>
                    )}
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-dashed border-slate-600/50 bg-slate-900/30 p-4">
                  <p className="text-xs text-slate-400 mb-2">📋 Formato esperado:</p>
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-slate-500">
                    <div>
                      <strong className="text-slate-300">CSV:</strong><br />
                      nome,preco,imagem,link,affiliate,avaliacao,vendidos,categoria
                    </div>
                    <div>
                      <strong className="text-slate-300">JSON:</strong><br />
                      [{ '{ "name": "...", "price": 29.90, ... }' }]
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  Link do produto Shopee
                  <input
                    value={productLink}
                    onChange={(event) => setProductLink(event.target.value)}
                    placeholder="https://shopee.com.br/..."
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Link de afiliado Shopee
                  <input
                    value={affiliateLink}
                    onChange={(event) => setAffiliateLink(event.target.value)}
                    placeholder="Seu link de afiliado ou shortlink"
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Nome do produto
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Mini cortador de alho USB"
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  Preço
                  <input
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="R$29,90"
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  URL da imagem de qualidade
                  <input
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="https://.../imagem-produto.jpg"
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="space-y-2 text-sm text-slate-300 sm:w-[48%]">
                  Observação rápida
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Ex: tamanho compacto ou ótimo para presentes"
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300 sm:w-[48%]">
                  Status do Pin
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as PinStatus)}
                    className="w-full rounded-3xl border border-slate-700/80 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                  >
                    <option value="pendente">Pendente</option>
                    <option value="agendado">Agendado</option>
                    <option value="publicado">Publicado</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={addProduct}
                  className="rounded-3xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Adicionar produto e gerar Pin
                </button>
                <button
                  type="button"
                  onClick={fetchShopeeImage}
                  disabled={loadingImage}
                  className="rounded-3xl border border-slate-700/80 px-5 py-3 text-slate-100 transition hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingImage ? 'Buscando imagem...' : 'Buscar imagem Shopee'}
                </button>
              </div>
              {errorMessage ? (
                <div className="mt-4 rounded-3xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div>
              ) : null}
            </div>

            <aside className="space-y-6">
              <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
                <h2 className="text-lg font-semibold text-white">Preview instantâneo</h2>
                {productPreview ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                      <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">Título</p>
                      <p className="mt-2 text-slate-100">{productPreview.title}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                      <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">Descrição</p>
                      <p className="mt-2 text-slate-100">{productPreview.description}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">Hook</p>
                        <p className="mt-2 text-slate-100">{productPreview.hook}</p>
                      </div>
                      <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">CTA</p>
                        <p className="mt-2 text-slate-100">{productPreview.cta}</p>
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                      <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">Hashtags</p>
                      <p className="mt-2 text-slate-100">{productPreview.hashtags.join(' ')}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                      <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/90">Imagem sugerida</p>
                      {imageUrl ? (
                        <img alt="Preview" src={imageUrl} className="mt-3 max-h-52 w-full rounded-3xl object-cover" />
                      ) : (
                        <p className="mt-2 text-slate-400">Cole a URL de imagem ou use Buscar imagem Shopee.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 text-slate-400">Preencha nome, link e preço para visualizar o pin.</p>
                )}
              </div>

              <div className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
                <h2 className="text-lg font-semibold text-white">Calendário semanal</h2>
                <p className="mt-2 text-slate-400">A distribuição automática garante horários de pico em 8h, 12h, 18h e 21h.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {scheduleDays.map((day, index) => (
                    <div key={day} className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-4">
                      <p className="font-semibold text-slate-100">{day}</p>
                      <p className="mt-2 text-sm text-slate-400">{scheduleTimes[index % scheduleTimes.length]}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>
        )}

        <section className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Painel de gestão</h2>
              <p className="mt-2 text-slate-400">Veja todos os produtos cadastrados, status e preview rápido do Pin.</p>
            </div>
            <button onClick={copyAll} className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Copiar todos os Pins</button>
          </div>

          <div className="mt-6 space-y-4">
            {products.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-700/80 bg-slate-950/70 p-6 text-slate-400">Nenhum produto cadastrado ainda.</div>
            ) : (
              products.map((product) => (
                <article key={product.id} className="grid gap-4 rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 sm:grid-cols-[0.9fr_0.4fr]">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/80">{product.status.toUpperCase()}</p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{product.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{product.price} · {product.schedule}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateProductStatus(product.id, product.status === 'pendente' ? 'agendado' : product.status === 'agendado' ? 'publicado' : 'pendente')}
                        className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200 transition hover:bg-cyan-500/10"
                      >
                        {product.status === 'pendente' ? 'Agendar' : product.status === 'agendado' ? 'Marcar como publicado' : 'Reabrir'}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Título</p>
                        <p className="mt-2 text-slate-100">{product.title}</p>
                      </div>
                      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Hashtags</p>
                        <p className="mt-2 text-slate-100">{product.hashtags.join(' ')}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Hook</p>
                        <p className="mt-2 text-slate-100">{product.hook}</p>
                      </div>
                      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">CTA</p>
                        <p className="mt-2 text-slate-100">{product.cta}</p>
                      </div>
                      <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Nota</p>
                        <p className="mt-2 text-slate-100">{product.note || 'Sem observação'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Imagem</p>
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name} 
                          className="mt-3 h-40 w-full rounded-3xl object-cover"
                          onError={(e: any) => {
                            e.target.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop';
                          }}
                        />
                      ) : (
                        <img 
                          src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop" 
                          alt="Imagem padrão" 
                          className="mt-3 h-40 w-full rounded-3xl object-cover opacity-50"
                        />
                      )}
                    </div>
                    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Link</p>
                      <a href={product.productLink} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-cyan-300 transition hover:text-cyan-200">Abrir produto Shopee</a>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
