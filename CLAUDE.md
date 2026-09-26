# CLAUDE.md

Contexto permanente do projeto para o Claude. Leia antes de mexer em qualquer coisa.

## O que é o ZapWave

Chat em tempo real. O objetivo real **não é o chat** — é **estudar Node streams a fundo**
(backpressure, `pipeline`, Readable/Writable/Transform, stream vs EventEmitter). O chat é
só o cenário que força esses problemas a aparecer (entrega de mensagem, replay em
reconexão, paginação de histórico, arquivamento em lote).

Toda a documentação conceitual e as decisões travadas ficam em [`docs/`](./docs/README.md):

| Doc | Assunto |
|-----|---------|
| [`docs/01-streams.md`](./docs/01-streams.md) | o que é stream, backpressure, e os 4 lugares onde o projeto usa stream |
| [`docs/02-redis.md`](./docs/02-redis.md) | Redis vs Postgres, por que Redis é a peça central |
| [`docs/03-entidades.md`](./docs/03-entidades.md) | entidades, campos, o que é Postgres vs Redis, fluxos |
| [`docs/04-arquitetura.md`](./docs/04-arquitetura.md) | camadas, regra de dependência, árvore de pastas, ports × adapters × fakes |
| [`docs/05-websocket.md`](./docs/05-websocket.md) | handshake (cookie + `deviceId` + `Origin`), close codes, heartbeat/presença, backpressure até o socket, limite de escala |
| [`docs/06-redis-streams.md`](./docs/06-redis-streams.md) | como o `RedisMessageStream` usa `XADD`/`XREADGROUP`/`XACK`/`XAUTOCLAIM`, consumer group, `MAXLEN` |

Se uma decisão de conceito não estiver clara, o `.md` do assunto manda. Se não estiver
coberta, resolver e **escrever a resposta no doc**.

## Stack

- **NestJS 11** + **TypeScript** (strict)
- **Prisma** / PostgreSQL — fonte da verdade durável
- **Redis** (ioredis) — tempo real: presença, filas de mensagens (Redis Streams), contadores
- **WebSocket** (`@nestjs/platform-ws` + `ws`) — transporte do chat
- **Vitest** — testes unitários (`src/**/*.spec.ts`, `test/**/*.spec.ts`) e e2e (`src/**/*.e2e-spec.ts`)
- Segurança: `helmet`, CORS restrito (`CORS_ORIGINS`, hoje só localhost), rate limit com
  `@nestjs/throttler` (`RATE_LIMIT_ENABLED`; login 10/min e cadastro 5/min por IP)
- Node 22 (`.nvmrc`)

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm test` | testes unitários (Vitest, `src/**/*.spec.ts`) |
| `npm run test:watch` | Vitest em watch |
| `npm run test:e2e` | testes e2e (precisam de Postgres + Redis no ar: `npm run services:up`) |
| `npm run lint` | ESLint com `--fix` (roda em `src` e `test`) |
| `npm run format` | Prettier |
| `npm run start:dev` | API com hot reload (`GET :3333/health` → `{ "status": "ok" }`) |
| `npm run services:up` / `services:down` | sobe / derruba Postgres + Redis (Docker) |
| `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` | Prisma |

Rodar **um arquivo de teste**: `npx vitest run src/domain/accounts/applications/use-cases/register-user.spec.ts`
(e2e: `npx vitest run --config vitest.config.e2e.ts src/infra/http/hardening.e2e-spec.ts`)

Migrations: `npm run prisma:migrate` (precisa do Postgres no ar). Sem banco, dá pra gerar o
SQL offline com
`prisma migrate diff --from-schema-datamodel <schema antigo> --to-schema-datamodel prisma/schema.prisma --script`
e salvar em `prisma/migrations/<timestamp>_<nome>/migration.sql`. No Windows,
`prisma generate` falha com EPERM se algum processo node (ex.: `nest start`) estiver
segurando a DLL do engine — feche-o antes.

## Arquitetura — regra de dependência (inviolável)

```
core   →  não importa nada
domain →  importa só core
infra  →  importa domain e core
test   →  importa core e domain (implementa as MESMAS interfaces do domain)
```

**`domain` NUNCA importa `infra`, Nest, Prisma, Redis, `ws` nem nada de I/O.** Se o domínio
precisa do mundo externo, ele declara uma **interface (port)** em `application/` e o `infra`
fornece o **adapter**; o `test` fornece um **fake**. Trocar adapter real ↔ fake é justamente
o experimento de streams (EventEmitter vs stream).

### Camadas dentro de `domain/<contexto>/`

- `entities/` — entidades e value objects, JS puro, estendem `Entity<Props>` do core.
  `static create(props, id?)` como construtor; setters chamam `touch()` p/ `updatedAt`.
- `application/use-cases/` — um caso de uso por arquivo, classe com `execute()`.
- `application/repositories/` — **classes abstratas** (não `interface`) usadas como token DI do Nest.
- `application/cryptography/`, `application/gateways/` — outros ports (também classes abstratas).
- `application/mappers/`, `application/dtos/`, `application/errors/`.

Contextos do domínio (por assunto, não por tipo técnico): `accounts`, `social`, `chat`,
`rooms`, `notification` (singular, como está no código). Todos já existem.

Ports que o `infra` implementa e o `test` substitui por fakes: `MessageStream` e `Presence`
(`chat/applications/gateways/`), `SessionGateway` (`accounts/applications/gateways/`),
mais os repositórios e os de criptografia.

> Nota: o `docs/04` diz `enterprise/` + `application/`. O código atual usa `entities/` +
> `applications/` (plural). Seguir o padrão **já existente no código** ao adicionar arquivos
> num contexto; alinhar com o doc só numa refatoração deliberada.

## Convenções de código

- **Prettier**: sem ponto e vírgula, aspas simples, `trailingComma: es5`, 2 espaços. Rode
  `npm run lint` antes de terminar.
- **Either** para o retorno dos use-cases — nunca `throw` para erro de regra de negócio:
  ```ts
  type FooRes = Either<SomeError, { bar: Baz }>
  // sucesso: return right({ bar })   |   falha: return left(new SomeError())
  ```
  `result.isRight()` / `result.isLeft()` são type guards — estreite antes de ler `result.value`.
- **Erros de use-case** estendem `Error implements UseCaseError` e vivem em
  `application/errors/` (ou `core/errors/err/` quando genéricos: `ResourceNotFoundError`,
  `NotAllowedError`).
- **Imports**: `@/*` → `src/*`, `test/*` → `test/*` (ver `tsconfig.json`).
- Injeção via construtor, dependências como `private`. Sem decorators no `domain`.

## Convenções de teste

- Vitest com `globals: true`, mas os specs existentes **importam explícito** de `vitest` —
  manter esse estilo.
- Nome: `describe('Register User', ...)`, `it('should be able to ...', ...)`.
- A instância sob teste chama-se `sut`. Montada em `beforeEach`.
- Sem banco/rede em teste unitário: usar os **fakes e in-memory** de `test/`:
  - `test/repositories/in-memory-*-repository.ts` — um por repositório (user, devices,
    friendship, conversation, conversation-member, message, room-invite, notification)
  - `test/gateways/` — `in-memory-message-stream.ts`, `fake-presence.ts`, `fake-session-gateway.ts`
  - `test/cryptography/fake-hasher.ts` (implementa `HashGenerator` + `HashCompare`; `hash` = `plain + '-hashed'`)
  - `test/cryptography/fake-encrypter.ts` (`encrypt` = `JSON.stringify(payload)`)
  - `test/factories/make-*.ts` — `makeUser(override?, id?)` etc., com `@faker-js/faker`
- Cada novo port precisa de um fake/in-memory em `test/` para os use-cases continuarem testáveis sem `infra`.
- **e2e** (`*.e2e-spec.ts`, ao lado do controller/adapter que testam): sobem o `AppModule`
  inteiro contra Postgres + Redis reais. Cada arquivo roda num schema Postgres próprio
  (`test/setup-e2e.ts` cria, migra e dropa), então arquivos são independentes.
  - Monte o app com `configureApp(app)` (`src/infra/setup-app.ts`) — é o mesmo setup do
    `main.ts` (helmet, cookie-parser, CORS, `WsAdapter`). Sem o `WsAdapter` o Nest tenta
    socket.io e derruba o processo.
  - O setup dos e2e desliga o rate limit (`RATE_LIMIT_ENABLED=false`); só o
    `hardening.e2e-spec.ts` o religa (via `vi.hoisted`, antes de importar o `AppModule`).
  - Evento de domínio é assíncrono (handlers disparam sem `await`): em teste que depende
    dele (ex.: notificações), faça polling com timeout em vez de checar na hora.

## Estado atual

Backend funcional de ponta a ponta, ainda sem frontend:

- **Contextos com código:** `accounts` (cadastro, login com device, revogar device), `social`
  (pedido de amizade, aceitar/recusar), `rooms` (criar, convidar, aceitar convite, sair,
  remover membro), `chat` (DM, enviar mensagem, histórico paginado, marcar como lida, ack
  de entrega, presença), `notification` (buscar, marcar lida, criar via eventos de domínio).
- **Infra:** Prisma com todos os models e migrations (repositórios Prisma para tudo),
  Redis (`RedisMessageStream` = 1 Redis Stream por device, `RedisPresence`), WebSocket
  (`ChatGateway` em `/ws`) com o pipeline de Node streams (`Readable` → `Transform` →
  `Writable` via `pipeline()`), heartbeat com `terminate()` de conexão morta, e o
  `NotificationModule` ligando os eventos de domínio ao `SendNotificationUseCase`.
- **Escritas atômicas:** DM (`dmKey` unique), criação de sala e aceite de convite gravam
  tudo-ou-nada; convite tem unique `(conversationId, inviteeId)`.
- **Endurecimento feito:** helmet, CORS só localhost, rate limit, checagem de `Origin` no WS,
  índices nas consultas principais. CI **não** foi implementado (decisão do usuário).

**Pendências conhecidas** (detalhes em [`docs/03`](./docs/03-entidades.md) §6):
listagens de leitura (minhas conversas, amigos, pedidos e convites pendentes, membros da sala,
meus devices) e o contador de não lidas — serão definidos junto com o frontend; falta o
`decline-room-invite`; revogar device não invalida o JWT no HTTP (só no WS/ack); texto das
notificações usa id cru; indicador de digitação ainda não existe; `NoopSessionGateway` é o
adapter atual de `SessionGateway`.
