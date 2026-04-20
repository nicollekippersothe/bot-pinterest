#!/bin/bash

echo "🚀 Deploy Bot Pinterest-Shopee no Vercel"
echo "========================================"

# Verificar se Vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI não encontrado. Instale com: npm i -g vercel"
    exit 1
fi

# Verificar se está logado
if ! vercel whoami &> /dev/null; then
    echo "🔐 Faça login no Vercel:"
    vercel login
fi

echo "📦 Fazendo build do projeto..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Erro no build. Corrija os erros antes de fazer deploy."
    exit 1
fi

echo "🚀 Fazendo deploy..."
vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deploy realizado com sucesso!"
    echo "🌐 Acesse sua aplicação na URL mostrada acima"
    echo ""
    echo "📝 Próximos passos:"
    echo "1. Configure as variáveis de ambiente no painel Vercel"
    echo "2. Teste as funcionalidades"
    echo "3. Configure o domínio personalizado (opcional)"
else
    echo "❌ Erro no deploy. Verifique os logs acima."
    exit 1
fi