# Bot Pinterest-Shopee Automático

Este projeto implementa um bot completo de afiliados que combina análise de tendências com automação de publicação no Pinterest.

## 🚀 Deploy no Vercel (3 passos)

### ⚡ Opção 1: Deploy Automático (Mais Fácil)
```bash
./deploy.sh
```

### 📋 Opção 2: Deploy Manual
```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Login e deploy
vercel login
vercel --prod

# 3. Configurar variáveis no painel Vercel:
# PINTEREST_EMAIL=seu@email.com
# PINTEREST_PASSWORD=sua_senha
```

**Resultado**: `https://bot-pinterest-[seu-nome].vercel.app` 🚀

---

## 📊 Arquitetura

### Frontend (React + TypeScript)
- Interface moderna com Tailwind CSS
- Modo manual e automático
- Preview em tempo real do conteúdo
- Gestão de produtos e agendamento

### Backend (Node.js + Express + TypeScript)
- **Análise de Tendências**: Pinterest + Shopee APIs
- **Automação Web**: Puppeteer para Pinterest
- **Agendamento**: Cron jobs automáticos
- **Matching Inteligente**: Score-based product selection

## � Como Obter Produtos da Shopee

### 🚀 **3 Formas de Carregar Produtos**

#### 1. **Upload de Feed (Recomendado para Lotes)**
- **Fonte**: Painel de Afiliados Shopee → "Relatórios" → "Feed de Produtos"
- **Formato**: CSV ou JSON
- **Campos obrigatórios**: nome, preco, imagem, link
- **Campos opcionais**: avaliacao, vendidos, categoria

#### 2. **Busca Automática (Para Testes)**
- O bot faz web scraping em tempo real
- Busca por palavras-chave das tendências
- Limitação: Rate limiting da Shopee

#### 3. **Inserção Manual**
- Adicione produtos individualmente
- Ideal para produtos específicos

### 📋 **Estrutura do Arquivo CSV**

```csv
nome,preco,imagem,link,avaliacao,vendidos,categoria
"Processador de Alho USB",29.90,"https://...", "https://shopee.com.br/...",4.8,1250,"Cozinha"
"Mop Giratório Inteligente",45.00,"https://...", "https://shopee.com.br/...",4.6,890,"Limpeza"
```

### 📋 **Estrutura do Arquivo JSON**

```json
[
  {
    "name": "Processador de Alho USB",
    "price": 29.90,
    "image": "https://...",
    "link": "https://shopee.com.br/...",
    "rating": 4.8,
    "soldCount": 1250,
    "category": "Cozinha"
  }
]
```

### 🔗 **Configuração do Painel Shopee**

#### Passo 1: Acesse o Painel de Afiliados
1. Entre em [shopee.com.br/afiliados](https://shopee.com.br/afiliados)
2. Faça login com sua conta
3. Vá para "Painel de Afiliados"

#### Passo 2: Ative o Programa de Afiliados
- Clique em "Participar do Programa"
- Preencha seus dados bancários
- Aguarde aprovação (geralmente 24h)

#### Passo 3: Baixe o Feed de Produtos
1. No menu lateral: **Relatórios** → **Feed de Produtos**
2. Selecione período (últimos 30 dias recomendado)
3. Escolha formato: **CSV** ou **JSON**
4. Clique em **Download**

#### Passo 4: Configure Links de Afiliado
- Use o campo `link` do feed (já contém seu código de afiliado)
- Ou gere links personalizados no painel

### 🎯 **Como Usar no Bot**

1. **Faça download** do feed no painel Shopee
2. **Clique** "Escolher arquivo" no modo Manual
3. **Selecione** seu arquivo CSV/JSON
4. **Aguarde** o processamento
5. **Clique** "Usar produto" nos itens desejados

### 💡 **Vantagens do Feed**

- ✅ **Processamento em lote** (centenas de produtos)
- ✅ **Sem rate limiting**
- ✅ **Dados atualizados** do painel Shopee
- ✅ **Links de afiliado** já configurados
- ✅ **Informações completas** (avaliações, vendas)

### 🔄 **Atualização do Feed**

- **Frequência**: Baixe novo feed semanalmente
- **Automação**: Configure script para baixar automaticamente
- **Comparação**: O bot identifica produtos novos/modificados

### 🚨 **Troubleshooting**

#### Problema: "Arquivo inválido"
- **Solução**: Verifique se é CSV/JSON válido
- **Verificação**: Abra o arquivo em um editor de texto
- **Formato esperado**: Veja exemplos acima

#### Problema: "Nenhum produto encontrado"
- **Causa**: Filtro de preço muito restritivo (R$15-55)
- **Solução**: Ajuste filtros ou use produtos dentro da faixa
- **Alternativa**: Modifique `process-feed.js` para faixa personalizada

#### Problema: "Links não funcionam"
- **Causa**: Conta de afiliado não aprovada
- **Verificação**: Acesse painel Shopee → Status da conta
- **Solução**: Aguarde aprovação ou gere novos links

#### Problema: "Arquivo muito grande"
- **Limite**: 10MB por upload
- **Solução**: Divida o feed em arquivos menores
- **Alternativa**: Processe em lotes via API

### 📈 **Métricas de Performance**

- **Upload**: Até 1000 produtos por arquivo
- **Processamento**: ~2 segundos por 100 produtos
- **Compatibilidade**: Chrome 90+, Firefox 88+, Safari 14+

### 🔒 **Segurança e Privacidade**

- **Dados locais**: Arquivos processados apenas no navegador
- **Sem upload para servidor**: Processamento client-side
- **Links de afiliado**: Use apenas seus próprios códigos
- **Armazenamento**: Dados ficam apenas na sessão atual
- **Limpeza**: Feche o navegador para limpar dados

### 💰 **Otimização de Receita**

- **Faixa de preço**: R$15-55 (alta conversão)
- **Produtos populares**: Alto volume de vendas
- **Avaliações positivas**: 4.5+ estrelas
- **Tendências**: Use análise de trends do bot
- **Rotação**: Atualize produtos semanalmente

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

## 🔧 Como Usar

### Instalação
```bash
# Frontend
npm install
npm run dev

# Backend (em outro terminal)
cd backend
npm install
npm run dev
```

### Configuração
1. **Pinterest**: Configure email/senha no modo automático
2. **Shopee**: Links de afiliado são gerados automaticamente
3. **Agendamento**: Bot publica automaticamente nos horários ideais

## 🤖 Modos de Operação

### Manual
- Usuário seleciona produtos
- Gera conteúdo otimizado
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

## 📁 Estrutura do Projeto

```
bot-pinterest/
├── src/                    # Frontend React
├── backend/               # Backend Node.js
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   └── server.ts      # Express server
│   └── README.md
├── package.json
└── README.md
```

## 🎯 Funcionalidades Principais

- ✅ Análise automática de tendências Pinterest
- ✅ Busca inteligente de produtos Shopee
- ✅ Geração de conteúdo SEO otimizado
- ✅ Automação de publicação no Pinterest
- ✅ Agendamento inteligente por horários
- ✅ Score-based product matching
- ✅ Interface moderna e responsiva
- ✅ Gestão completa de produtos

## 🔮 Melhorias Futuras

- Integração com Pinterest API oficial (quando aprovado pins:write)
- Machine learning para predição de tendências
- Análise de concorrência
- Relatórios de performance
- Multiplataforma (Instagram, TikTok)
