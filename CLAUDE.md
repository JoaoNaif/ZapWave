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

Se uma decisão de conceito não estiver clara, o `.md` do assunto manda. Se não estiver
coberta, resolver e **escrever a resposta no doc**.

## Stack

- **NestJS 11** + **TypeScript** (strict)
- **Prisma** / PostgreSQL — fonte da verdade durável
- **Redis** (ioredis) — tempo real: presença, filas de mensagens (Redis Streams), contadores
- **WebSocket** (`@nestjs/platform-ws` + `ws`) — transporte do chat
- **Vitest** — testes unitários (`src/**/*.spec.ts`) e e2e (`test/**/*.e2e-spec.ts`)
- Node 22 (`.nvmrc`)

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm test` | testes unitários (Vitest, `src/**/*.spec.ts`) |
| `npm run test:watch` | Vitest em watch |
| `npm run test:e2e` | testes e2e |
| `npm run lint` | ESLint com `--fix` (roda em `src` e `test`) |
| `npm run format` | Prettier |
| `npm run start:dev` | API com hot reload (`GET :3333/health` → `{ "status": "ok" }`) |
| `npm run services:up` / `services:down` | sobe / derruba Postgres + Redis (Docker) |
| `npm run prisma:generate` / `prisma:migrate` / `prisma:studio` | Prisma |

Rodar **um arquivo de teste**: `npx vitest run src/domain/accounts/applications/use-cases/register-user.spec.ts`

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
`rooms`, `notifications`. Hoje só `accounts` existe.

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
  - `test/repositories/in-memory-user-repository.ts`
  - `test/cryptography/fake-hasher.ts` (implementa `HashGenerator` + `HashCompare`; `hash` = `plain + '-hashed'`)
  - `test/cryptography/fake-encrypter.ts` (`encrypt` = `JSON.stringify(payload)`)
  - `test/factories/make-user.ts` — `makeUser(override?, id?)` com `@faker-js/faker`
- Cada novo port precisa de um fake/in-memory em `test/` para os use-cases continuarem testáveis sem `infra`.

## Estado atual

Só o contexto `accounts` tem código: entidade `User`, use-cases `RegisterUserUseCase` e
`AuthenticateUserUseCase`. `infra/` tem o esqueleto Nest (health, env, prisma service,
redis service) — sem models Prisma, sem controllers de conta, sem WebSocket ainda.
