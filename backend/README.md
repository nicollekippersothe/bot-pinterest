# Bot Pinterest-Shopee Automático

Este projeto implementa um bot completo de afiliados que:

1. **Analisa tendências automaticamente**:
   - Busca tendências de busca no Pinterest
   - Identifica produtos populares na Shopee
   - Faz matching inteligente entre tendências e produtos

2. **Gera conteúdo otimizado**:
   - Títulos SEO para Pinterest
   - Descrições com keywords
   - Hooks de engajamento
   - Hashtags estratégicas

3. **Publica automaticamente**:
   - Usa Puppeteer para automação web
   - Agenda postagens nos melhores horários
   - Gerencia login e criação de pins

## 🚀 Como usar

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend (já existente)
```bash
npm run dev
```

## 📊 Lógica de Seleção de Produtos

### 1. Análise de Tendências Pinterest
- Volume de busca mensal
- Taxa de crescimento
- Categoria do nicho

### 2. Filtros Shopee
- Preço: R$15-55 (faixa alvo)
- Rating: mínimo 4.0 estrelas
- Volume de vendas: produtos populares
- Categoria: casa & cozinha

### 3. Score de Matching
```
Score = (Volume Pinterest × 0.4) + (Crescimento × 0.3) + (Rating × 20) + (Vendas × 0.1)
```

### 4. Agendamento Automático
- Horários de pico: 8h, 12h, 18h, 21h
- Distribuição semanal: segunda a domingo
- Rotação de produtos para evitar repetição

## 🔧 APIs e Integrações

### Pinterest
- **Tendências**: Simulado (produção: Pinterest API)
- **Publicação**: Puppeteer automation (até ter `pins:write`)

### Shopee
- **Produtos**: Web scraping com proxy
- **Afiliados**: Link generation (implementar API real)

## ⚙️ Configuração

Criar arquivo `.env` no backend:
```
PINTEREST_EMAIL=seu@email.com
PINTEREST_PASSWORD=sua_senha
SHOPEE_AFFILIATE_ID=seu_id_afiliado
PORT=3001
```

## 🤖 Modos de Operação

### Manual
- Usuário seleciona produtos
- Gera conteúdo
- Cópia para colar no Pinterest

### Semi-automático
- Bot sugere produtos baseados em tendências
- Usuário aprova antes de publicar

### Totalmente Automático
- Bot analisa tendências diariamente
- Seleciona melhores produtos
- Publica automaticamente nos horários programados

## 📈 Estratégia de Monetização

1. **Afiliados Shopee**: Comissão por venda
2. **Conteúdo Viral**: Pins que geram engajamento
3. **SEO Pinterest**: Otimização para descoberta orgânica
4. **Horários Estratégicos**: Pico de atividade dos usuários

## 🔒 Segurança

- Credenciais armazenadas em variáveis de ambiente
- Rate limiting para evitar bans
- Logs de auditoria
- Backup automático de dados