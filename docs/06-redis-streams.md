# 06 — Redis Streams: como o `MessageStream` é implementado

> Objetivo deste documento: registrar a decisão de **como exatamente** o `RedisMessageStream`
> usa `XADD`/`XREADGROUP`/`XACK`/`XGROUP`, e por quê. Ver [01](./01-streams.md) para a
> diferença entre Redis Streams (armazém) e Node Streams (encanamento), e
> [03](./03-entidades.md) §4 para o modelo "inbox por device".

---

## 1. Uma stream por device

Chave: `chat:inbox:{deviceId}`. Cada device tem sua própria Redis Stream — não uma por
sala/conversa. Isso bate com a regra do doc 03: **a unidade de entrega e de pendência é o
device**. `publish()` faz `XADD` numa chave por destinatário (fan-out na escrita).

**Premissa assumida:** um device tem no máximo uma conexão WS ativa por vez. Por isso o
`consumer` dentro do consumer group é um nome fixo (`"device"`) — não existe hoje o caso
de duas conexões simultâneas disputando o mesmo inbox. Se isso mudar (multi-tab do mesmo
device), vira `XCLAIM`/`XAUTOCLAIM` — fica para o `07-fases.md`.

## 2. Consumer group: por que e quando é criado

Um único consumer group por stream, chamado `delivery`. `XADD` **não precisa** do grupo —
ele funciona em qualquer stream, com ou sem grupo. O grupo só importa para quem **lê**
(`XREADGROUP`), então ele é criado sob demanda, no primeiro `subscribe()` ou
`replayFrom()` daquele device, não no `publish()`:

```
XGROUP CREATE chat:inbox:{deviceId} delivery 0 MKSTREAM
```

- `MKSTREAM`: cria a stream vazia se ainda não existir (device que nunca recebeu nada).
- `0` (não `$`): o grupo nasce enxergando **desde o início** da stream, não só dali para
  frente. Motivo: mensagens podem ter sido publicadas para um device **antes** dele nunca
  ter se conectado (ex.: convite aceito, primeira mensagem chega antes do primeiro login).
  Com `$`, essas mensagens ficariam invisíveis para sempre no `XREADGROUP '>'`. Com `0`,
  aparecem todas no primeiro read.
- `BUSYGROUP` (grupo já existe) é esperado e ignorado — `ensureGroup()` é idempotente.

## 3. Os dois modos de leitura = os dois métodos do port

| Port | Comando | `id` | Bloqueia? | Quando |
|------|---------|------|-----------|--------|
| `subscribe(deviceId)` | `XREADGROUP ... STREAMS key >` | `>` (nunca entregues a ninguém do grupo) | sim, `BLOCK` em janelas (ex. 5s) | tempo real, device conectado |
| `replayFrom(deviceId, afterMessageId)` | dois reads: `STREAMS key 0` depois `STREAMS key >` | `0` então `>` | não | reconexão |

`>` e `0` são semânticas nativas do consumer group, mas **não são "tudo que falta" e
"nada"** — são dois conjuntos disjuntos que juntos formam "tudo não confirmado":

- `0` devolve só o que **já foi lido por este consumer antes** e segue sem `XACK` — o
  PEL de uma sessão anterior que caiu no meio. Mensagens **nunca lidas** não aparecem
  aqui, mesmo que estejam havia dias na stream — pegadinha real do Redis, não é "desde o
  início".
- `>` devolve o que **nunca foi entregue a ninguém do grupo** — e, ao ler, entra no PEL a
  partir de agora.

Por isso `replayFrom` faz os dois reads, nessa ordem, sem bloquear: primeiro drena o PEL
antigo (`0`), depois pega o que é genuinamente novo (`>`). Sem sobreposição, porque um
evento só pode estar num dos dois estados a cada momento. Isso **é** o primitivo
"mensagens pendentes + replay" que o doc 02 menciona como o motivo de usar Redis em vez de
reimplementar isso na mão — só que ele exige montar os dois reads, o Redis não expõe
"tudo que falta" como um comando só.

`BLOCK` em janelas curtas (não `BLOCK 0` infinito): o gerador precisa devolver o controle
periodicamente para reagir a `.return()` (conexão WS fechou) sem ficar preso num
`XREADGROUP` bloqueado para sempre.

`replayFrom` filtra de novo por `afterMessageId` (string compare — ids de `Message` são
ULID, ordenável) mesmo lendo do PEL: o PEL já deveria refletir só "não confirmado", mas
filtrar de novo é defensivo contra um `ack()` que chegou no Postgres e não no Redis (ver
TODO em `ack-message-delivery.ts`).

## 4. `ack()` é cumulativo, não por mensagem

Confirmar `messageId` confirma **essa mensagem e todas as anteriores** daquele device —
mesma regra do `Device.resumeCursorId` no Postgres (cursor, não checklist por item) e do
`InMemoryMessageStream.ack()` já existente.

Implementação: `XRANGE key - +` (lê a stream inteira daquele device), filtra as entradas
com `messageId <= ` a confirmada, e para essas: `XACK` (sai do PEL) + `XDEL` (sai da
stream, não ocupa espaço para sempre — é "janela recente", não histórico).

**Trade-off aceito:** isso é O(tamanho do inbox) a cada ack, não O(1). Para o tamanho de
inbox esperado aqui (dezenas de mensagens entre acks) é irrelevante; a alternativa seria
guardar um índice `messageId → id da stream` à parte, mais peça para manter consistente,
sem ganho real na escala do projeto. Se algum dia o inbox de um device ficar enorme
(device offline por semanas), o gargalo está em outro lugar (ver `MAXLEN` abaixo) antes de
chegar aqui.

## 5. `MAXLEN` — Redis é janela, não histórico

`XADD` usa `MAXLEN ~ 1000`: cada inbox guarda no máximo ~1000 mensagens (trim
aproximado, barato). Se um device fica offline além disso, as mensagens mais antigas somem
do Redis **antes de serem confirmadas** — mas continuam no Postgres. O cliente reconecta,
faz `replayFrom` para o que sobrou no Redis, e busca o resto via
`GET /conversation-history` (já existe, doc 01 §8 Lugar 2). Redis nunca é o único lugar
onde uma mensagem existe — é exatamente o "não é lugar de guardar para sempre" do doc 02.

## 6. Conexão dedicada para leitura bloqueante

`subscribe()` e `replayFrom()` usam `redis.duplicate()` — uma conexão TCP própria por
chamada, não a conexão principal do `RedisService`. Motivo: `XREADGROUP BLOCK` prende a
conexão até haver dado ou o timeout estourar; se fosse a conexão compartilhada, um
`publish()` de outro request ficaria esperando atrás do bloqueio. A conexão duplicada é
fechada (`quit()`) no `finally` do generator — dispara quando o consumidor para de puxar
(`break`, `.return()`, ou o `pipeline()` do lado do WebSocket sendo destruído). É o mesmo
gancho que depois liga o "parar de ler no Redis quando o socket cai" do
`05-websocket.md`.

## 7. `XAUTOCLAIM`: por que não é bem "recuperação de crash"

Primeira surpresa, testando contra o Redis de verdade: **reconectar já recupera o PEL
sozinho**, sem precisar de `XCLAIM` nenhum. O PEL é indexado por `(group, consumer)`, não
por conexão TCP nem processo — e como `CONSUMER_NAME` é uma string fixa (`"device"`) por
premissa (§1), qualquer processo que receba a reconexão daquele device lê `'0'` e recebe de
volta exatamente o que ficou pendente, não importa se foi *este* processo que caiu ou
outro. Confirmado escrevendo um teste que entrega uma mensagem, mata a conexão, abre uma
**conexão nova e sem estado nenhum** com o mesmo `CONSUMER_NAME`, e lê `'0'` — ela volta.

O bug de verdade é outro, e mais sério: **`MAXLEN` do `publish()` pode remover da stream
uma entrada que ainda está pendente no PEL de algum device**. `XPENDING` continua listando
o id — mas o dado já foi embora. Um `XREADGROUP ... STREAMS key 0` nessa entrada "fantasma"
devolve `[id, null]` (fields `null`, não um array vazio) — e o `RedisMessageMapper` não
esperava isso: qualquer device que ficasse offline tempo suficiente pra sua mensagem mais
antiga ser trimada, ao reconectar, **derrubava o `replayFrom` inteiro**. Confirmado com o
mesmo tipo de teste: `XADD` pequeno, `MAXLEN` agressivo, `XREADGROUP id 0` — o `null` chega.

`XAUTOCLAIM key group consumer min-idle-time start` resolve os dois problemas de uma vez,
e por isso substituiu o read `'0'` inteiro em `replayFrom`:

- Devolve `[cursor, claimedEntries, deletedIds]`. `claimedEntries` tem o mesmo formato
  `[id, fields]` do `XREADGROUP` — mesmo dado que o `'0'` antigo dava.
- **Qualquer entrada fantasma some sozinha da resposta e do PEL** — vai para `deletedIds`,
  não para `claimedEntries`. Sem `null`, sem `if` defensivo, sem `XACK` manual: o comando já
  faz a limpeza.
- `min-idle-time 0`: não existe outro consumer disputando posse (premissa do §1), então
  reclamar de si mesmo é inofensivo — só reseta o relógio de idle daquela entrada.

Trade-off que continua aberto: se um device **nunca** reconectar, sua mensagem mais antiga
ainda pode ser trimada antes de ser confirmada — só que agora, quando ele finalmente voltar
(daqui a uma hora ou um ano), `replayFrom` não quebra por causa disso; simplesmente não traz
de volta o que já não existe mais no Redis (o cliente busca esse trecho via
`GET /conversation-history`, como já valia desde o §5).

## 8. O que fica para depois (`07-fases.md`)

- Multi-tab (mais de um consumer por device) — hoje assume-se 1 conexão ativa por device.
- Sweep periódico e independente de reconexão, pra devices que nunca voltam (hoje a limpeza
  só acontece quando o próprio device reconecta e chama `replayFrom`).
