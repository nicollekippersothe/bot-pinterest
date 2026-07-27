# CLAUDE.md — Engine de Afiliados Multi-Canal

## 🎯 Objetivo do Projeto

Aplicação automatizada (Node.js + TypeScript) para mineração de ofertas de afiliados
(Shopee / Amazon), geração de anúncios enriquecidos com IA e publicação automatizada
em canais de alto tráfego (Pinterest via automação de navegador e Telegram via Bot API).

## 📌 Contexto deste repositório

Este repositório **já continha** um bot Pinterest-Shopee anterior: front-end React + Vite
com funções serverless em `api/` (Puppeteer), publicado na Vercel. Esse app continua
funcionando e **não foi alterado**.

A engine descrita aqui vive em `engine/`, isolada do app existente:

- `engine/` tem o próprio `tsconfig.json` e roda como processo Node de longa duração
  (o que a Fase 4 exige, já que Playwright com sessão persistente não funciona em
  funções serverless).
- O `package.json` é compartilhado — a engine adicionou scripts com prefixo `engine:`.
- O ID de afiliado Shopee (`an_18393280814`) foi reaproveitado de `api/shopee/search.js`.

## 🛠️ Tech Stack

| Camada | Ferramenta | Status |
| --- | --- | --- |
| Runtime | Node.js 22 + TypeScript | ✅ Fase 1 |
| Persistência | SQLite (`better-sqlite3`) | ✅ Fase 1 |
| Mineração | `fetch` na busca da Shopee + gerador mock | ✅ Fase 2 |
| IA & LLM | `@anthropic-ai/sdk` (copy, SEO, hashtags) | ✅ Fase 3 |
| Imagem | `sharp` (pin 1000x1500) | ✅ Fase 3 |
| Pinterest | Playwright com sessão persistente | ⏳ Fase 4 |
| Telegram | `node-telegram-bot-api` | ⏳ Fase 5 |
| Agendamento | `node-cron` | ⏳ Fase 5 |

## 📁 Estrutura

```text
engine/
├── src/
│   ├── config/           # .env, caminhos e constantes         ✅
│   ├── database/         # db.ts, schema.ts, offers.ts         ✅
│   ├── miner/            # types, mock, shopee, index          ✅
│   ├── processor/        # copywriter.ts + image.ts            ✅
│   ├── publisher/        # pinterest.ts + telegram.ts          ⏳ Fases 4-5
│   ├── scripts/smoke.ts  # teste de fumaça das Fases 1-3       ✅
│   ├── utils/            # logger.ts, links.ts                 ✅
│   └── index.ts          # orquestrador / cron job             ✅ (fases 1-3)
└── tsconfig.json
storage/                  # banco, imagens geradas e sessão do Playwright (git-ignored)
.env.example
```

## ⚙️ Comandos

```bash
npm run engine        # roda o pipeline uma vez (tsx)
npm run engine:test   # teste de fumaça das Fases 1-3 (sem rede)
npm run engine:build  # compila para engine/dist
npm run engine:start  # roda o build compilado

npm run dev / build   # app React+Vite existente (inalterado)
```

## 🔐 Variáveis de Ambiente

Copie `.env.example` para `.env`. Nada de segredo entra no repositório —
`.env` e `storage/` estão no `.gitignore`.

`MINER_SOURCE=mock` é o padrão e não faz nenhuma requisição de rede.

## 🗄️ Modelo de Dados

Tabela única `offers`. A coluna `product_key` é **UNIQUE** e é o que garante que o
mesmo produto nunca seja reprocessado nem repostado:

- Shopee: `shopee:<shopid>.<itemid>`, extraído da URL (query string ignorada).
- Fallback: `<plataforma>:<sha1 da URL limpa>`.

Toda escrita passa por `INSERT OR IGNORE`, então uma reexecução do pipeline é
idempotente. Status do ciclo de vida: `pending → processed → posted` (ou `failed`).

Colunas adicionadas depois da Fase 1 (copy, hashtags, caminho do pin) são aplicadas
via `ALTER TABLE` na conexão, então bancos antigos migram sozinhos.

## 🚀 Fases de Desenvolvimento

### ✅ Fase 1 — Fundação & Banco de Dados

Projeto TypeScript, camada SQLite (`engine/src/database/`) e controle de duplicidade.

### ✅ Fase 2 — Mineração de Ofertas

`engine/src/miner/` captura título, preços original/com desconto, imagem em alta
resolução e link de afiliado, tudo normalizado no contrato `MinedOffer`.

- `mock.ts` — payload simulado, imagens reais e baixáveis (para testar a Fase 3).
- `shopee.ts` — busca real; falha de rede apenas registra aviso e pula a palavra-chave.
  A Shopee costuma bloquear IPs de datacenter, então em CI o mock é o caminho padrão.

### ✅ Fase 3 — Agente de IA & Visual

1. `processor/copywriter.ts` — chamada ao Claude (`claude-opus-5` por padrão) com
   **structured outputs**, garantindo título com gatilho mental (≤100 caracteres),
   descrição de conversão/SEO (≤500) e hashtags. O prompt proíbe inventar
   características, prazos ou avaliações que não estejam nos dados da oferta.
   Há um **fallback de template local** para quando não existe `ANTHROPIC_API_KEY`,
   a chamada falha ou o modelo recusa — a IA nunca derruba o pipeline.
2. `processor/image.ts` com `sharp` — baixa a imagem (com limite de tamanho e
   timeout), monta o pin **1000x1500 (2:3)**: fundo desfocado derivado da própria
   foto, produto inteiro via `fit: 'contain'` (produto quadrado não é cortado) e
   faixa inferior com preço, preço original riscado e selo de desconto.

A faixa de preço usa SVG com `DejaVu Sans` e alternativas; em uma máquina sem
fontes instaladas o texto não renderiza — instale `fonts-dejavu-core`.

### ⏳ Fase 4 — Publisher Pinterest (Playwright)

Primeiro acesso em modo headful para login, salvando sessão em
`storage/pinterest_state.json`; execuções seguintes em headless reutilizando os cookies.
Fluxo: pin-builder → upload da imagem → título/descrição/link → board → publicar.

### ⏳ Fase 5 — Publisher Telegram & Orquestrador

Envio da foto com copy e botão de compra no canal; orquestração completa
(mineração → IA/design → Pinterest → Telegram → registro no SQLite) com `node-cron`.

## ⚠️ Notas operacionais

- Automação de login do Pinterest com credenciais em `.env` é frágil e contraria os
  termos de uso da plataforma; a conta pode ser limitada ou bloqueada. Vale usar uma
  conta dedicada e cadência conservadora.
- Scraping da Shopee é instável por design. O `MINER_SOURCE` existe para que o
  pipeline seja desenvolvido e testado sem depender disso.
