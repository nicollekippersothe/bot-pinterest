import cron from 'node-cron';
import { TrendAnalyzer } from '../services/trendAnalyzer.js';
import { PinterestAutomation } from '../routes/automation.js';

class AutoBot {
  private analyzer: TrendAnalyzer;
  private automation: PinterestAutomation;
  private isRunning: boolean = false;

  constructor() {
    this.analyzer = new TrendAnalyzer();
    this.automation = new PinterestAutomation();
  }

  async startAutomatedPosting(schedule: string = '0 8,12,18,21 * * *') {
    if (this.isRunning) return;

    this.isRunning = true;

    // Agendar execução automática
    cron.schedule(schedule, async () => {
      try {
        console.log('🤖 Iniciando postagem automática...');

        // 1. Buscar melhores combinações
        const matches = await this.analyzer.findBestMatches();
        const topMatch = matches[0];

        if (!topMatch || topMatch.products.length === 0) {
          console.log('❌ Nenhum produto encontrado para postar');
          return;
        }

        // 2. Selecionar produto aleatório dos top 3
        const randomProduct = topMatch.products[Math.floor(Math.random() * Math.min(3, topMatch.products.length))];

        // 3. Gerar conteúdo do pin
        const pinData = this.generatePinContent(randomProduct, topMatch.trend);

        // 4. Postar no Pinterest
        const success = await this.automation.createPin(pinData);

        if (success) {
          console.log('✅ Pin postado automaticamente:', pinData.title);
        } else {
          console.log('❌ Falha ao postar pin');
        }

      } catch (error) {
        console.error('Erro na postagem automática:', error);
      }
    });

    console.log(`🤖 Bot automático iniciado com agendamento: ${schedule}`);
  }

  private generatePinContent(product: any, trend: any) {
    const title = `${product.name} - ${trend.keyword} | Achadinhos Casa & Cozinha`;
    const description = `${product.name} por apenas R$${product.price} na Shopee! ${trend.keyword} com qualidade e economia. Aproveite este achado incrível para sua casa.`;
    const hook = `Você cansou de ${trend.keyword.replace(' ', ' menos ')}? Este produto resolve tudo!`;
    const hashtags = ['#Achadinhos', '#ShopeeBrasil', '#CasaECo', `#${trend.keyword.replace(' ', '')}`, '#Organizacao'];

    return {
      title: title.substring(0, 100),
      description: description.substring(0, 500),
      imageUrl: product.image,
      link: product.affiliateLink,
      hashtags
    };
  }

  stop() {
    this.isRunning = false;
    console.log('🤖 Bot automático parado');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRuns: [] // Simplificado para evitar problemas com cron
    };
  }
}

export { AutoBot };