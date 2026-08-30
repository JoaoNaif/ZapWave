# ZapWave

Chat em tempo real feito para **entender streams no Node a fundo**.
A documentação conceitual e as decisões de arquitetura ficam em [`docs/`](./docs/README.md).

## Stack

- **NestJS 11** + **TypeScript**
- **Prisma** (PostgreSQL) — fonte da verdade
- **Redis** (ioredis) — tempo real, presença, filas de mensagens
- **WebSocket** (`@nestjs/platform-ws` + `ws`) — transporte do chat
- **Vitest** — testes unitários e e2e

## Pré-requisitos

- Node.js 22 (ver `.nvmrc`)
- Docker + Docker Compose (para subir Postgres e Redis)

## Setup

```bash
# 1. variáveis de ambiente
cp .env.example .env        # no Windows: copy .env.example .env

# 2. dependências
npm install

# 3. sobe Postgres + Redis
npm run services:up

# 4. Prisma (ainda sem models — não cria tabelas por enquanto)
npm run prisma:generate

# 5. sobe a API em modo watch
npm run start:dev
```

Verificação rápida: `GET http://localhost:3333/health` → `{ "status": "ok" }`

## Scripts

| Script | O que faz |
|--------|-----------|
| `npm run start:dev` | API com hot reload |
| `npm run services:up` / `services:down` | sobe / derruba Postgres + Redis (Docker) |
| `npm run prisma:generate` | gera o Prisma Client |
| `npm run prisma:migrate` | cria/aplica migrations (quando houver models) |
| `npm run prisma:studio` | abre o Prisma Studio |
| `npm test` | testes unitários (`src/**/*.spec.ts`) |
| `npm run test:e2e` | testes e2e (`test/**/*.e2e-spec.ts`) |
| `npm run lint` | ESLint com `--fix` |
| `npm run format` | Prettier |

## Estrutura

Camadas `core` / `domain` / `infra` com regra de dependência estrita.
Detalhes e árvore completa em [`docs/04-arquitetura.md`](./docs/04-arquitetura.md).

```
src/
  core/     # shared kernel (ainda vazio)
  domain/   # entidades + use-cases (ainda vazio)
  infra/    # Nest, Prisma, Redis, HTTP  ← já montado
test/
prisma/
```
