import cron from 'node-cron';

class AutoBot {
  constructor() {
    this.analyzer = null; // Será definido quando necessário
    this.automation = null; // Será definido quando necessário
    this.isRunning = false;
  }

  async startAutomatedPosting(schedule = '0 8,12,18,21 * * *') {
    if (this.isRunning) return;

    this.isRunning = true;

    // Agendar execução automática
    cron.schedule(schedule, async () => {
      try {
        console.log('🤖 Iniciando postagem automática...');

        // Para Vercel, a automação precisa ser diferente
        // Como são funções serverless, não podemos manter estado
        console.log('🤖 Postagem automática agendada (Vercel mode)');

      } catch (error) {
        console.error('Erro na postagem automática:', error);
      }
    });

    console.log(`🤖 Bot automático iniciado com agendamento: ${schedule}`);
  }

  generatePinContent(product, trend) {
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