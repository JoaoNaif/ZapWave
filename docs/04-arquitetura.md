# 04 — Arquitetura e estrutura de pastas

> Objetivo deste documento: fixar **as camadas**, **a regra de dependência**, **a árvore
> de pastas** e **as convenções** do projeto. Serve de referência ao criar qualquer
> arquivo novo.

---

## 1. Decisões travadas

| Tema | Decisão |
|------|---------|
| Framework | **NestJS** (o usuário já tem familiaridade) |
| ORM | **Prisma** |
| Validação | **zod** (schema das requests e das env vars) |
| Estilo | Clean architecture / DDD leve, no estilo do template Rocketseat usado no `curva-modas-nest` |
| Camada `core` | **Separada** de `domain` (shared kernel) |
| Organização do domínio | **Por contexto** (`accounts`, `social`, `chat`, `rooms`, `notifications`), não por tipo técnico |
| Nomes de pasta | **Inglês** (padrão Nest / template) |
| Pastas raiz de código | `src/` e `test/` |

---

## 2. As camadas e a regra de dependência

```
core   →  não importa nada
domain →  importa só core
infra  →  importa domain e core
test   →  importa core e domain (implementa as mesmas interfaces do domain)
```

**`domain` NUNCA importa `infra` nem `@prisma/client`.** Se precisar de algo do mundo
externo (banco, Redis, WebSocket, hash), o domain declara uma **interface** (port) e o
`infra` fornece a implementação (adapter).

| Camada | O que vive aqui | Depende de |
|--------|-----------------|-----------|
| **core** | `Entity`, `AggregateRoot`, `UniqueEntityID`, `Either` (Result), `DomainEvent`, `PaginationParams`, erro base de use-case | nada |
| **domain / `<contexto>` / enterprise** | entidades, value objects, eventos de domínio (JS puro) | core |
| **domain / `<contexto>` / application** | use-cases + **interfaces** de repositório e de gateways | core, enterprise |
| **infra** | Nest, Prisma, Redis, WebSocket, HTTP, cryptography — **implementações** das interfaces + entrypoints | domain, core |
| **test** | factories, repositórios in-memory, gateways fake — implementam as **mesmas interfaces** do domain | core, domain |

---

## 3. Árvore de pastas

```
zapwave/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ docker-compose.yml                 # postgres + redis
├─ src/
│  ├─ core/                           # sem dependência de Nest/Prisma
│  │  ├─ entities/  (entity.ts, aggregate-root.ts, unique-entity-id.ts)
│  │  ├─ events/    (domain-event.ts, domain-events.ts)
│  │  ├─ errors/    (use-case-error.ts)
│  │  ├─ either.ts
│  │  └─ pagination-params.ts
│  │
│  ├─ domain/
│  │  ├─ accounts/
│  │  │  ├─ enterprise/entities/      user.ts · device.ts
│  │  │  └─ application/
│  │  │     ├─ repositories/          users-repository.ts · devices-repository.ts      (interfaces)
│  │  │     ├─ cryptography/          hasher.ts · encrypter.ts                          (interfaces)
│  │  │     └─ use-cases/             register-user · authenticate-user · revoke-device
│  │  ├─ social/
│  │  │  ├─ enterprise/entities/      friendship.ts
│  │  │  └─ application/
│  │  │     ├─ repositories/          friendships-repository.ts
│  │  │     └─ use-cases/             send-friend-request · accept · decline
│  │  ├─ chat/
│  │  │  ├─ enterprise/
│  │  │  │  ├─ entities/              conversation.ts · conversation-member.ts · message.ts
│  │  │  │  └─ events/                message-sent.event.ts
│  │  │  └─ application/
│  │  │     ├─ repositories/          conversations · conversation-members · messages
│  │  │     ├─ gateways/              message-stream.ts · presence.ts                   (interfaces)
│  │  │     └─ use-cases/             open-direct-conversation · send-message ·
│  │  │                               fetch-conversation-history · ack-message-delivery ·
│  │  │                               mark-conversation-read
│  │  ├─ rooms/
│  │  │  ├─ enterprise/entities/      room-invite.ts
│  │  │  └─ application/
│  │  │     ├─ repositories/          room-invites-repository.ts
│  │  │     └─ use-cases/             create-room · invite-to-room · accept-room-invite ·
│  │  │                               remove-member · leave-room
│  │  └─ notifications/
│  │     ├─ enterprise/entities/      notification.ts
│  │     └─ application/
│  │        ├─ repositories/          notifications-repository.ts
│  │        ├─ gateways/              notification-dispatcher.ts                        (interface)
│  │        └─ use-cases/             send-notification · read-notification
│  │
│  ├─ infra/
│  │  ├─ auth/                        jwt.strategy.ts · jwt-auth.guard.ts
│  │  ├─ cryptography/                bcrypt-hasher.ts · jwt-encrypter.ts   (implementam as interfaces)
│  │  ├─ database/
│  │  │  └─ prisma/
│  │  │     ├─ prisma.service.ts
│  │  │     ├─ mappers/               prisma-user-mapper.ts · …   (Prisma model ↔ entidade de domínio)
│  │  │     └─ repositories/          prisma-users-repository.ts · …   (implementam as interfaces)
│  │  ├─ redis/
│  │  │  ├─ redis.service.ts          conexão (ioredis)
│  │  │  ├─ redis-message-stream.ts   implementa gateways/message-stream (Redis Streams)
│  │  │  └─ redis-presence.ts         implementa gateways/presence (TTL + heartbeat)
│  │  ├─ streams/                     ★ Node streams — o coração
│  │  │  ├─ device-inbox.readable.ts  Readable: inbox de um device (Redis)
│  │  │  ├─ history.readable.ts       Readable: pagina histórico
│  │  │  ├─ ws.writable.ts            Writable: escreve no socket do device
│  │  │  ├─ enrich.transform.ts       Transform: filtra / formata / serializa
│  │  │  └─ delivery-pipeline.ts      monta pipeline(readable, transform, writable)
│  │  ├─ websocket/
│  │  │  ├─ chat.gateway.ts           entrypoint WS: valida, chama use-case, liga o pipeline
│  │  │  ├─ ws-auth.ts                handshake: token → Device
│  │  │  └─ heartbeat.ts              ping/pong, atualiza lastSeen
│  │  ├─ http/
│  │  │  ├─ controllers/              um por rota (register-user, authenticate, friendships, rooms, …)
│  │  │  ├─ presenters/               entidade de domínio → JSON de resposta
│  │  │  └─ pipes/                    validação (zod)
│  │  ├─ events/subscribers/          liga evento de domínio → use-case (ex: message-sent → fan-out)
│  │  ├─ env/                         env.ts (schema zod das variáveis)
│  │  ├─ app.module.ts
│  │  └─ main.ts
│
└─ test/
   ├─ factories/                     makeUser(), makeMessage(), …
   ├─ repositories/                  in-memory-*-repository.ts   (mesmas interfaces do domain)
   ├─ gateways/                      in-memory-message-stream.ts · fake-presence.ts
   ├─ cryptography/                  fake-hasher.ts · fake-encrypter.ts
   └─ e2e/                           sobe o app + cliente ws real (send / reconnect / replay)
```

---

## 4. As regras que fazem isso funcionar

1. **Regra de dependência:** `core` não importa nada. `domain` importa só `core`. `infra`
   importa `domain` e `core`. **`domain` nunca importa `infra` nem `@prisma/client`.**
2. **Controller (HTTP) e Gateway (WS) são gêmeos:** os dois são entrypoints finos no
   `infra`; validam a entrada, chamam o **mesmo use-case** e formatam a saída. Zero regra
   de negócio. O use-case não sabe se foi chamado por HTTP ou WS.
3. **Prisma model ≠ entidade de domínio.** Por isso os `mappers/`. A entidade `Message`
   do domínio não tem nada de `@prisma`; o mapper converte nas bordas.
4. **Composition root = os `*.module.ts` do Nest.** É onde se amarra
   `{ provide: MessageStream, useClass: RedisMessageStream }`. Num módulo de teste,
   trocar por `InMemoryMessageStream` é uma linha.
5. **`infra/streams/` é pasta própria de propósito** — é o assunto que o projeto existe
   para estudar ([doc 01](./01-streams.md)), então não fica diluído dentro do gateway.

---

## 5. Ports (domain) × Adapters (infra) × Fakes (test)

Cada interface do domínio tem **uma implementação real no `infra`** e **uma fake no
`test`**. Trocar entre elas é o experimento EventEmitter-vs-stream do [doc 01](./01-streams.md).

| Interface (domain) | Onde | Impl. real (infra) | Fake (test) |
|--------------------|------|--------------------|-------------|
| `UsersRepository` | `accounts/application/repositories` | `PrismaUsersRepository` | `InMemoryUsersRepository` |
| `DevicesRepository` | `accounts/application/repositories` | `PrismaDevicesRepository` | `InMemoryDevicesRepository` |
| `FriendshipsRepository` | `social/application/repositories` | `PrismaFriendshipsRepository` | `InMemoryFriendshipsRepository` |
| `ConversationsRepository` / `ConversationMembersRepository` / `MessagesRepository` | `chat/application/repositories` | `Prisma*Repository` | `InMemory*Repository` |
| `RoomInvitesRepository` | `rooms/application/repositories` | `PrismaRoomInvitesRepository` | `InMemoryRoomInvitesRepository` |
| `NotificationsRepository` | `notifications/application/repositories` | `PrismaNotificationsRepository` | `InMemoryNotificationsRepository` |
| `MessageStream` (publish / subscribe / replayFrom) | `chat/application/gateways` | `RedisMessageStream` (Redis Streams) | `InMemoryMessageStream` (EventEmitter) |
| `Presence` | `chat/application/gateways` | `RedisPresence` (TTL + heartbeat) | `FakePresence` |
| `NotificationDispatcher` (push ao vivo) | `notifications/application/gateways` | `WsNotificationDispatcher` | `FakeNotificationDispatcher` |
| `Hasher` / `Encrypter` | `accounts/application/cryptography` | `BcryptHasher` / `JwtEncrypter` | `FakeHasher` / `FakeEncrypter` |

---

## 6. Fluxo de uma requisição (exemplo: enviar mensagem)

```
Cliente ──WS──▶ chat.gateway.ts            (infra/websocket)
                  │  valida payload (zod)
                  │  resolve o Device pelo token
                  ▼
              SendMessageUseCase           (domain/chat/application/use-cases)
                  │  regras: é membro? conversa existe? amizade (se DM)?
                  │  cria Message (enterprise)
                  │  MessagesRepository.create()      → interface
                  │  MessageStream.publish(convId, msg) → interface
                  │  dispara evento MessageSent
                  ▼
        ┌─────────┴───────────────────────────────┐
        ▼                                         ▼
  PrismaMessagesRepository            RedisMessageStream.publish
  (infra/database/prisma)             (infra/redis) → XADD no log da conversa
                                                    → fan-out p/ inbox de cada device

  subscriber de MessageSent (infra/events) ── monta o delivery-pipeline (infra/streams)
      pipeline( DeviceInboxReadable → EnrichTransform → WsWritable )   ← backpressure aqui
```

Repare: **o use-case não menciona Redis, Prisma nem socket** — só interfaces. Toda a
mecânica de stream está no `infra`.

---

## 7. Ressalva

Full DDD/clean num projeto cujo foco é infra pode virar cerimônia (mapper e interface
demais). Onde essa estrutura **realmente paga** aqui:

- trocar adapter Redis ↔ in-memory (o experimento de streams)
- use-case testável sem subir Nest/WS/Redis
- gateway WS fininho que só orquestra

Se em algum ponto uma interface tiver **uma só implementação** e nunca for ter outra
(nem em teste), tudo bem não criar a interface. Não perseguir pureza.

---

## 8. Pontos em aberto

1. `presenters/` sempre, ou retornar a entidade direto quando o shape já serve?
2. Um `*.module.ts` do Nest por contexto (`ChatModule`, `AccountsModule`, …) — provável
   que sim; confirmar granularidade.
3. `infra/events` usando `@nestjs/event-emitter` para os eventos de domínio in-process
   (o bus **entre instâncias** é sempre Redis — [doc 02](./02-redis.md)).
4. Estratégia de migração do Prisma no fluxo local (script no `docker-compose` vs manual).

---

## 9. Glossário rápido

| Termo | Significado curto |
|-------|-------------------|
| **core (shared kernel)** | tipos base usados por todas as camadas; não depende de nada |
| **enterprise** | entidades e regras que valem independente de aplicação (dentro de `domain`) |
| **application** | use-cases + interfaces (ports) do que o domínio precisa do mundo externo |
| **port** | interface declarada no `domain` (ex: `MessageStream`) |
| **adapter** | implementação de um port, no `infra` (ex: `RedisMessageStream`) |
| **composition root** | onde se amarra port → adapter; aqui, os `*.module.ts` do Nest |
| **mapper** | converte entre Prisma model e entidade de domínio, nas bordas |
| **presenter** | converte entidade de domínio no JSON da resposta HTTP |
| **entrypoint** | controller (HTTP) ou gateway (WS): recebe, valida, chama use-case, responde |
| **regra de dependência** | o código de fora depende do de dentro, nunca o contrário |
