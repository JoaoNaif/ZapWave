# 03 — Entidades, tabelas e estrutura de dados do ZapWave

> Objetivo deste documento: fechar **quais entidades existem**, **quais campos elas têm**,
> **como se relacionam**, **o que fica no Postgres vs no Redis** e **os fluxos principais**.
> Serve de referência para modelar o banco e o domínio.

---

## 1. Decisões travadas

| Tema | Decisão |
|------|---------|
| Modelo de conversa | **Unificado**: uma entidade `Conversation` com `type: 'dm' \| 'room'`. DM é "sala de 2 sem admin". |
| DM | Só entre usuários com **amizade aceita**. |
| Sala | Só **privada** (entra por convite). Sem sala pública por enquanto. |
| Convite de sala | **Assíncrono**: fica `pending` até o convidado aceitar. |
| Mensagens | **Imutáveis** (sem editar/apagar por enquanto). |
| Multi-dispositivo | Modelado desde já via entidade `Device`. Entrega e pendências são rastreadas **por device** (**inbox por device**). |
| Amizade — nomes dos campos | `senderId` / `recipientId`. |

---

## 2. Visão geral das entidades

```
User ──< Friendship >── User            amizade: pending / accepted / blocked
User ──< Device                         1 usuário → N dispositivos/sessões
User ──< ConversationMember >── Conversation ──< Message
             │                     │
        role, cursores       type: dm | room
Conversation ──< RoomInvite >── User    convite de sala (só type = room)
User ──< Notification                   eventos sociais/sistema
```

Tudo isto vive no **Postgres** (fonte da verdade). O que é efêmero/tempo real vive no
**Redis** — ver seção 5.

---

## 3. Entidades (Postgres)

### 3.1 `User`

Conta. Sem conta não existe mensagem (nada anônimo).

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `username` | text | único; handle público (ex: `@ana`) |
| `displayName` | text | nome exibido |
| `email` | text | único |
| `passwordHash` | text | hash (argon2/bcrypt), nunca a senha |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### 3.2 `Friendship`

Pedido e vínculo de amizade. É pré-requisito para DM.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `senderId` | uuid → User | quem enviou o pedido |
| `recipientId` | uuid → User | quem recebeu |
| `status` | enum | `pending` / `accepted` / `blocked` |
| `createdAt` | timestamptz | |
| `respondedAt` | timestamptz? | quando aceitou/recusou |

- Único por par: não pode haver duas linhas para o mesmo par de usuários (normalizar o
  par para impedir A→B e B→A duplicados).
- **Em aberto:** semântica de `blocked` (quem bloqueou quem). Provável adicionar
  `blockedById` depois. Não trava nada agora.

### 3.3 `Conversation`

Uma conversa — DM ou sala.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `type` | enum | `dm` / `room` |
| `name` | text? | só em `room`; nulo em `dm` |
| `createdById` | uuid → User | quem criou |
| `createdAt` | timestamptz | |

- `dm`: exatamente 2 membros, sem `name`, `role` ignorado. Deve existir no máximo **uma**
  DM por par de usuários (guardar uma chave normalizada do par, única).
- `room`: N membros, tem `name` e papéis.

### 3.4 `ConversationMember`

Quem está dentro de uma conversa, com papel e cursores de leitura.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK (ou PK composta `conversationId` + `userId`) |
| `conversationId` | uuid → Conversation | |
| `userId` | uuid → User | |
| `role` | enum | `owner` / `admin` / `member` (irrelevante em DM) |
| `joinedAt` | timestamptz | |
| `lastReadMessageId` | uuid? | última mensagem que o **usuário** leu → contador de não lidas e recibo ✓✓ |

- Único por `(conversationId, userId)`.
- **Entrega (✓)** é rastreada **por device** (ver `Device.resumeCursor`), não aqui.
  Leitura (✓✓) é ação do usuário, então fica aqui.

### 3.5 `Message`

Mensagem. Imutável.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | ULID/uuid | PK. **ULID recomendado**: ordenável por tempo, ajuda no replay/paginação |
| `conversationId` | uuid → Conversation | |
| `senderId` | uuid → User | |
| `body` | text | |
| `clientMessageId` | text? | **recomendado**: id gerado pelo cliente, para deduplicar quando ele reenvia após reconexão (idempotência) |
| `createdAt` | timestamptz | |

- Sem `editedAt` / `deletedAt` por enquanto (decisão: imutável).

### 3.6 `Device`

Um cliente logado da conta (celular, notebook, aba). É também a identidade da sessão
WebSocket. Ver [doc 02](./02-redis.md) e a discussão de inbox por device abaixo.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK; identifica a sessão WS |
| `userId` | uuid → User | |
| `name` / `userAgent` | text? | ex: "Chrome no Windows" |
| `createdAt` | timestamptz | quando logou |
| `lastSeenAt` | timestamptz | último heartbeat |
| `resumeCursor` | text? | id da última mensagem que **este device** confirmou receber |
| `revokedAt` | timestamptz? | logout / "sair de todos os aparelhos" |

- Login cria um `Device` + emite token ligado a ele. Logout preenche `revokedAt`.
- **Em aberto:** guardar `tokenHash` aqui se o refresh token for atrelado ao device.

### 3.7 `RoomInvite`

Convite para sala. Existe porque o convite é assíncrono (fica pendente).

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `conversationId` | uuid → Conversation | tem que ser `type = room` |
| `inviterId` | uuid → User | precisa ser `owner`/`admin` da sala |
| `inviteeId` | uuid → User | quem foi convidado |
| `status` | enum | `pending` / `accepted` / `declined` / `revoked` |
| `createdAt` | timestamptz | |
| `respondedAt` | timestamptz? | |

- No máximo um convite `pending` por `(conversationId, inviteeId)`.
- **RoomInvite = sala de espera. `ConversationMember` = está dentro.** Aceitar o convite
  cria a linha em `ConversationMember`.

### 3.8 `Notification`

Eventos sociais/sistema que precisam sobreviver entre sessões.

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | uuid | PK |
| `userId` | uuid → User | quem recebe |
| `type` | enum | `friend_request` / `friend_accepted` / `room_invite` / `room_invite_accepted` (mais depois) |
| `payload` | jsonb | ids referenciados (quem, qual sala) |
| `readAt` | timestamptz? | nulo = não lida |
| `createdAt` | timestamptz | |

- **Não** cai aqui "mensagem nova enquanto offline" — isso é tratado por mensagens
  pendentes + contador de não lidas (Redis). `Notification` é só evento social/sistema,
  senão a tabela explode.

**Como é disparada (domain events).** A entidade de origem é um `AggregateRoot` e
adiciona um evento; um subscriber em `notification/applications/subscribers/` escuta e
chama `SendNotificationUseCase`. O repositório (in-memory / Prisma) chama
`DomainEvents.dispatchEventsForAggregate(id)` no `create` **e** no `save`.

| `type` | Evento | Aggregate | Disparado em | Subscriber | Destinatário |
|--------|--------|-----------|--------------|------------|--------------|
| `friend_request` | `FriendCreatedEvent` | `Friendship` | `create()` (novo) | `OnFriendshipCreated` | recipient |
| `friend_accepted` | `FriendAcceptedEvent` | `Friendship` | `friendship.accept()` | `OnFriendshipAccepted` | sender |
| `room_invite` | `RoomInviteCreatedEvent` | `RoomInvite` | `create()` (novo) | `OnRoomInviteCreated` | invitee |
| `room_invite_accepted` | `RoomInviteAcceptedEvent` | `RoomInvite` | `roomInvite.accept()` | `OnRoomInviteAccepted` | inviter |

`decline` (amizade e sala) e `remove-member` / `leave-room` **não** geram `Notification`
por ora — não há `type` previsto. Menção `@user` fica pra fase posterior.

---

## 4. Inbox por device (modelo de entrega escolhido)

**Regra:** a unidade de entrega e de pendência é o **device**, não o usuário.

Cada device tem seu próprio **cursor de retomada** (`Device.resumeCursor`) = id da última
mensagem que ele confirmou (ACK). Uma mensagem só está "totalmente entregue" quando
**todos os devices** do destinatário confirmaram.

Ciclo de vida de uma mensagem enviada:

1. **Persistir** a `Message` (fonte da verdade) e colocá-la no log ordenado da conversa
   no Redis.
2. **Fan-out**: resolver os membros da conversa → para cada device conhecido de cada
   membro, enfileirar a mensagem no **inbox daquele device** (Redis).
3. Cada device conectado **consome seu inbox** por um pipeline de Node stream → WebSocket
   (com backpressure — ver [doc 01](./01-streams.md), Lugar 1).
4. Device manda **ACK** do id → sai da lista de pendentes, atualiza `Device.resumeCursor`.
5. **Reconexão**: o device manda seu `resumeCursor`; o servidor faz replay do inbox a
   partir dali (ver [doc 01](./01-streams.md), Lugar 3).

> Custo do modelo: 1 mensagem gera N escritas no Redis (uma por device). É o modelo
> WhatsApp/Signal. Aceitável e ótimo para estudar consumer groups + PEL.
>
> **As estruturas exatas do Redis** (nome dos streams, consumer groups, PEL, `XREADGROUP`,
> `XACK`, `XAUTOCLAIM`) ficam no `docs/06-redis-streams.md` — este doc trata só de
> entidades e fluxos.

---

## 5. O que NÃO é tabela (vive no Redis / é evento efêmero)

| Coisa | Onde | Por quê |
|-------|------|---------|
| Presença ("online agora", "visto por último") | Redis: chave com TTL + heartbeat, ou sorted set por `lastSeen` | expira sozinho |
| "Fulano está digitando…" | evento WebSocket; no máximo chave curtíssima (`EX 5`) | dura segundos |
| Contador de mensagens não lidas por conversa | Redis: contador atômico `unread:{userId}:{conversationId}` | muda o tempo todo |
| Log recente / entrega das mensagens | Redis Streams (log por conversa + inbox por device) | caminho quente |
| Mensagens pendentes / não entregues | Redis Streams (PEL do consumer group do device) | primitivo nativo |
| Membros **online** de uma sala | Redis: set derivado da presença | derivado |

Histórico durável completo das mensagens: **Postgres**, arquivado por um consumer numa
fase posterior.

---

## 6. Funcionalidades (escopo)

### Confirmadas

| Área | Funcionalidade |
|------|----------------|
| Conta | Cadastro, Login, **Logout / revogar sessão** |
| Amizade | Enviar pedido, **Aceitar / recusar** pedido |
| Sala | Criar sala, Convidar (admin), Remover membro (admin), **Sair da sala** |
| Conversa | Conversar no privado (DM), Conversar em sala |
| Tempo real | **Presença / visto por último**, **Recibos ✓ (entregue) / ✓✓ (lida)**, **Reconexão / resume** |
| Histórico | Paginação / scroll infinito (stream — [doc 01](./01-streams.md), Lugar 2) |

### Pendentes (decididas, ainda sem implementação)

**Contador de não lidas.** O dado já existe (`ConversationMember.lastReadMessageId`,
atualizado pelo `mark-conversation-read`), mas nada expõe o número. Só faz sentido junto
com a listagem de conversas (abaixo): é ela que vai mostrar o contador de cada uma.

**Listagens de leitura.** O que o app já **escreve** está completo (criar, convidar,
aceitar, enviar...), mas quase nada permite **ler** a lista de volta. Isso é proposital:
o formato de cada listagem (quais campos, ordenação, paginação, o que vem embutido) depende
do que cada tela do frontend precisa, então elas serão definidas **junto com o frontend**,
tela por tela. São use-cases novos — não exigem mexer nos use-cases que já existem.

| Listagem | O que já existe | O que falta |
|----------|-----------------|-------------|
| Minhas conversas (DMs + salas) | `ConversationMemberRepository.findManyByUserId` | use-case + controller; decidir o que cada item traz (nome da sala ou o outro participante da DM, última mensagem, contador de não lidas) |
| Meus amigos | nada (o repositório só busca por id e por par) | método no repositório (`ACCEPTED`, nas duas pontas), use-case, controller |
| Pedidos de amizade pendentes | nada | idem; decidir se lista só os recebidos ou também os enviados |
| Convites de sala pendentes (do convidado) | `RoomInviteRepository.findManyByIviteeIdWithStausPending` | use-case + controller. **Sem isso o convidado não tem como descobrir o `inviteId`** que o `accept-room-invite` exige — a notificação hoje só avisa que houve convite |
| Membros de uma sala | `ConversationMemberRepository.findManyByConversationId` | use-case + controller (só quem é membro pode ver) |
| Meus devices | `DevicesRepository.findManyByUserId` | use-case + controller; é dele que o usuário pega o `deviceId` pra usar no `revoke-device` |

**Recusar convite de sala.** O enum `StatusRoomInvite` já tem `DECLINED` e o fluxo de
"Convidar para sala" (§7) descreve a recusa, mas não existe use-case: hoje o convidado só
consegue aceitar. Falta o `decline-room-invite` (só o próprio convidado, só se `PENDING`).

**Texto das notificações.** Os subscribers montam o `content` com o **id cru** de quem
agiu ("`<uuid>` te enviou um pedido de amizade"). Serve pra provar o fluxo, não pra tela:
quando o frontend existir, ou o texto passa a usar o `displayName`, ou a notificação
guarda o id (e o tipo) e o front monta a frase.

**Indicador de digitação.** Continua decidido (fluxo "Digitação", §7), mas ainda não existe
no código: nem o frame `typing` no WebSocket, nem o repasse aos outros membros online. É o
caso de EventEmitter puro (evento pontual, sem backpressure) do [doc 01](./01-streams.md) §5.
Só faz sentido implementar junto com a tela de conversa.

### Fase posterior

- Editar / apagar mensagem
- Renomear sala, transferir dono
- Mídia (foto/áudio) com upload em stream
- Busca de mensagens (Postgres)
- Notificações de menção (`@user`)
- Arquivador de mensagens Redis → Postgres em lote (stream — [doc 01](./01-streams.md), Lugar 4)

---

## 7. Fluxos principais

### Cadastro
`POST /users` → cria `User` (com `passwordHash`).

### Login
Valida credenciais → cria `Device` → emite token ligado ao `Device` → cliente abre
WebSocket usando esse token.
**E-mail inexistente e senha errada são indistinguíveis:** mesmo erro (`WrongCredentialsError`
→ 401, mesmo corpo) e mesmo custo de tempo — quando o e-mail não existe o use-case gera
um hash descartável, senão a resposta seria muito mais rápida que a de "senha errada" (o
bcrypt é lento de propósito) e o tempo entregaria quais e-mails têm conta.

### Logout
`revokedAt` no `Device` (ou apaga). "Sair de todos": em todos os `Device` do usuário.
Revogar vale **na hora, no HTTP e no WebSocket**: o cookie daquele device passa a levar 401
e o socket aberto é fechado com 4401. Outras sessões do mesmo usuário não são afetadas.
Como funciona (cache no Redis, `deviceId` dentro do JWT): [doc 05](./05-websocket.md) §9.

### Adicionar amigo
`A` envia pedido → `Friendship(status=pending, sender=A, recipient=B)` + `Notification(B, friend_request)`.
`B` aceita → `Friendship.status=accepted` + `Notification(A, friend_accepted)`.
`B` recusa → `Friendship` removida (ou `status` próprio) — **em aberto**: apagar vs marcar.

### Abrir DM
Exige `Friendship(accepted)` entre `A` e `B` → *find-or-create* `Conversation(type=dm)`
com `ConversationMember` para `A` e `B`.

### Criar sala
`Conversation(type=room, name, createdById=A)` + `ConversationMember(A, role=owner)`.

### Convidar para sala
`owner`/`admin` cria `RoomInvite(status=pending)` + `Notification(invitee, room_invite)`.
Convidado aceita → `RoomInvite.status=accepted` + `ConversationMember(invitee, role=member)`.
Convidado recusa → `RoomInvite.status=declined`.

### Remover membro / sair da sala
Remover (`remove-member`): `owner`/`admin` apaga a linha `ConversationMember` do alvo.
Regras: não dá pra remover a si mesmo (isso é `leave-room`); o `owner` nunca é removido;
`admin` só remove `member` (não outro `admin` nem o `owner`); `owner` remove qualquer um.
Sair (`leave-room`): o próprio membro apaga sua linha.
**Decisão:** o `owner` **não pode sair** — recebe `NotAllowedError`. Transferir dono é um
use-case à parte que ainda não existe; enquanto não existir, a saída fica bloqueada.

### Enviar mensagem
Ver seção 4 (inbox por device).

### Digitação
Cliente emite evento `typing` na conversa → servidor repassa aos outros membros online.
Nada persistido. Bom exemplo de EventEmitter (empurra, sem backpressure) vs stream.

### Reconexão
Device reconecta e manda `resumeCursor` → servidor faz stream de tudo depois desse id
para aquele device.

---

## 8. Pontos ainda em aberto (não bloqueiam o modelo)

1. Semântica de `blocked` em `Friendship` (adicionar `blockedById`?).
2. `owner` saindo de uma sala: resolvido por ora — **impedir** (ver §7). Falta o
   use-case de transferir dono, que destravaria a saída.
3. Recusar pedido de amizade / convite: apagar a linha ou manter com `status`?
4. Atrelar `tokenHash` (refresh token) ao `Device`.
5. Esquema final de id de `Message` (ULID) e uso de `clientMessageId` para idempotência.

---

## 9. Glossário rápido

| Termo | Significado curto |
|-------|-------------------|
| **Conversation** | uma conversa; `dm` (2 pessoas) ou `room` (grupo) |
| **ConversationMember** | vínculo usuário↔conversa, com papel e cursor de leitura |
| **Device** | um cliente/sessão logada de um usuário; unidade de entrega |
| **resumeCursor** | id da última mensagem que um device confirmou; usado na reconexão |
| **inbox por device** | cada device tem sua própria fila de mensagens e lista de pendentes |
| **RoomInvite** | convite pendente para entrar numa sala ("sala de espera") |
| **Notification** | registro durável de evento social/sistema (não é "mensagem nova") |
| **✓ / ✓✓** | entregue (todos os devices confirmaram) / lida (usuário abriu) |
| **clientMessageId** | id gerado pelo cliente para deduplicar reenvio após reconexão |
