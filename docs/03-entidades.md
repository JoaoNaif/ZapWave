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
| Tempo real | **Indicador de digitação**, **Presença / visto por último**, **Recibos ✓ (entregue) / ✓✓ (lida)**, **Contador de não lidas**, **Reconexão / resume** |
| Histórico | Paginação / scroll infinito (stream — [doc 01](./01-streams.md), Lugar 2) |

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

### Logout
`revokedAt` no `Device` (ou apaga). "Sair de todos": em todos os `Device` do usuário.

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
Remover (admin): apaga a linha `ConversationMember` do alvo.
Sair: o próprio membro apaga sua linha.
**Em aberto:** o que acontece quando o `owner` sai (transferir dono? apagar sala? bloquear a saída?).

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
2. `owner` saindo de uma sala: transferir, apagar ou impedir?
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
