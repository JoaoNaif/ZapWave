# 01 — Streams no Node: conceito e onde aplicar no ZapWave

> Objetivo deste documento: consolidar, em linguagem simples, **o que é uma stream**,
> **por que ela existe** e **em que pontos do ZapWave vamos usá-la** — para consultar
> sempre que bater dúvida.

---

## 1. A visão do projeto (confirmada)

Fluxo do usuário:

1. Abre o app → precisa ter um usuário. **Não existe mensagem anônima** (igual Discord/WhatsApp).
2. Com usuário, ele pode:
   - **adicionar um amigo** e conversar no privado (DM), ou
   - **entrar numa sala** (grupo) e conversar com várias pessoas.
3. Nos dois casos o chat é **em tempo real**: a mensagem aparece na hora para quem está online.

Decisões ainda em aberto (não bloqueiam nada agora):

- **DM exige amizade aceita?** Provável que sim — cria a entidade `Friendship` e é mais realista.
- **Sala é pública ou tem dono/convite?** Começar com sala pública + lista de membros.

Esse escopo cobre: mensagens, salas, usuários online, histórico, notificações, reconexão e mensagens pendentes.

---

## 2. O que é uma stream (ideia central)

Analogia: transferir água de um tanque grande para outro.

- **Sem stream:** encher um balde com TODA a água de uma vez, carregar e despejar.
  Se o tanque tem 10.000 litros, você precisa de um balde de 10.000 litros. Inviável.
- **Com stream:** ligar uma **mangueira** entre os dois. A água passa aos poucos, contínua.
  Não importa se são 10 litros ou 10 milhões — a mangueira tem sempre o mesmo tamanho.

No Node é igual, com **dados** no lugar de água. Uma stream processa dados
**aos pedaços, conforme chegam**, em vez de carregar tudo na memória de uma vez.

Cada pedaço se chama **chunk**: um trecho de arquivo, uma linha de texto, ou — no nosso
caso — **uma mensagem de chat**.

---

## 3. Os 4 tipos de stream

| Tipo | O que faz | Analogia |
|------|-----------|----------|
| **Readable** | fonte de dados; você lê dela | a torneira / o tanque de origem |
| **Writable** | destino de dados; você escreve nela | o ralo / o tanque de destino |
| **Transform** | recebe, modifica, entrega | um filtro no meio da mangueira |
| **Duplex** | lê e escreve ao mesmo tempo | cano de mão dupla (ex: um socket TCP/WebSocket) |

Conexão entre elas:

```js
readable.pipe(transform).pipe(writable);
// versão moderna, com tratamento de erro e limpeza:
const { pipeline } = require('node:stream/promises');
await pipeline(readable, transform, writable);
```

Lê da fonte → passa pelo filtro → escreve no destino. Aos pedaços, o tempo todo.

### Object mode

Por padrão os chunks são bytes (`Buffer`). Com `{ objectMode: true }` os chunks podem
ser **objetos JavaScript** — que é o nosso caso: cada chunk é um objeto de mensagem.
Detalhe: em object mode, o `highWaterMark` (tamanho do buffer interno) passa a contar
**quantidade de objetos**, não bytes.

---

## 4. Backpressure ("contrapressão") — o recurso mais importante

É o motivo de streams existirem, e o conceito central que este projeto quer treinar.

De volta à mangueira: agora o tanque de destino é pequeno e enche rápido. Se você
continuar bombeando na força total, **transborda**.

**Backpressure** é a mangueira avisando a origem: *"pára de mandar, o destino está
cheio, espera escoar"*. Quando o destino esvazia um pouco, a origem volta a mandar.
Automático.

Em código:

- `writable.write(chunk)` retorna `false` quando o destino está sobrecarregado.
- O `pipe`/`pipeline` vê o `false`, **pausa a leitura da origem**.
- Quando o destino esvazia, ele emite o evento `drain` → a origem volta a produzir.

**Resultado:** a memória do processo fica estável, mesmo se a origem for 1000x mais
rápida que o destino.

---

## 5. Stream vs EventEmitter

EventEmitter (`emitter.emit('mensagem', dados)`) também serve para "avisar que algo
aconteceu" — mas **não tem freio**. Se você emite 10.000 eventos e quem escuta só
processa 100 por segundo, os outros 9.900 se acumulam na memória e nada segura a
origem.

> **EventEmitter empurra. Stream negocia o ritmo.**

Regra prática:

| Use... | Quando |
|--------|--------|
| **EventEmitter** | eventos pontuais e leves: "usuário entrou", "conexão caiu". Fluxo baixo, sem risco de acúmulo. |
| **Stream** | fluxo contínuo de dados que pode ser grande ou rápido, e onde origem e destino têm velocidades diferentes. |

No ZapWave, EventEmitter será usado como **bus de eventos de domínio in-process** e como
**adapter in-memory nos testes** — ele é a *baseline sem backpressure* para comparar
com o pipeline de stream.

---

## 6. Quando stream é a melhor escolha (regra geral)

Use stream quando **pelo menos um** for verdade:

- Os dados são grandes demais para caber confortável na memória (arquivo de 2 GB).
- Os dados **não têm fim** ou chegam **ao longo do tempo** (chat, feed, logs).
- **Produtor e consumidor têm velocidades diferentes** e você quer o rápido esperando o lento.
- Você quer **memória constante** independente do volume.

**Não** use stream quando:

- O dado é pequeno e você precisa dele inteiro para trabalhar (um JSON de 2 KB numa API REST).
- É um simples pedido → resposta com payload completo.

---

## 7. Node Streams vs Redis Streams (não confundir)

São **duas coisas diferentes** com o mesmo nome, e ambas aparecem no projeto:

| | O que é | Papel no ZapWave |
|---|---------|------------------|
| **Redis Streams** | estrutura de dados do Redis (`XADD`, `XREAD`, consumer groups, PEL) | **armazém** de mensagens: durabilidade, histórico, mensagens pendentes, replay na reconexão |
| **Node.js Streams** | `Readable`/`Writable`/`Transform` + `pipeline()` + backpressure | **encanamento**: liga o armazém (Redis) até a conexão do cliente (WebSocket) controlando o ritmo |

O objetivo de aprendizado é o **Node.js Stream**. Chamar `redis.xadd(...)` **não** conta
como "usei stream" — isso é só gravar no armazém. O aprendizado está em modelar o
caminho da mensagem como um **pipeline de Node streams**.

---

## 8. Onde vamos usar stream no ZapWave (e por quê)

Ponto que destrava tudo:

> **Uma conexão de chat já é uma stream por natureza.** As mensagens não têm fim,
> chegam ao longo do tempo, em ritmo imprevisível, e cada cliente consome numa
> velocidade diferente (wi-fi de casa vs 3G no ônibus). É o cenário de manual.

### Lugar 1 — Entrega de mensagens em tempo real (o principal)

**Situação:** você está numa sala; toda mensagem nova precisa chegar até você.

```
Redis (mensagens novas)  →  Transform (filtra sala + formata JSON)  →  seu WebSocket
       Readable                                                            Writable
                         \___________________ pipeline() ___________________/
```

**Por que stream aqui:** com 500 pessoas online e 50 no 3G, sem backpressure o servidor
vai acumulando mensagens "para entregar depois" em cada conexão lenta → a memória sobe
até o processo cair. Com o pipeline, quando **a sua** conexão está lenta, o servidor
**lê mais devagar do Redis só para você**, até você acompanhar. Memória estável.
**Esse é o "aha" do projeto.**

### Lugar 2 — Entrar numa sala / abrir uma conversa (carregar histórico)

**Situação:** você entra na sala e quer ver as mensagens antigas; e rolar para cima
para ver mais (scroll infinito).

Em vez de carregar **todo** o histórico na memória e mandar um pacotão gigante, um
`Readable` busca **de página em página** (ex: 50 mensagens por vez) e manda cada lote
conforme fica pronto. O cliente vai renderizando aos poucos.

**Por que stream aqui:** uma sala pode ter 1 milhão de mensagens. Streaming mantém a
memória do servidor plana (sempre ~50 mensagens por vez) e o cliente vê as primeiras
mensagens quase instantaneamente.

### Lugar 3 — Reconexão e mensagens pendentes

**Situação:** você ficou offline (metrô, avião) e volta. O cliente diz "minha última
mensagem recebida foi o id X"; o servidor faz um `Readable` que lê do Redis **tudo
depois de X** e manda para a sua conexão.

**Por que stream aqui:** uma semana offline podem ser 20.000 mensagens perdidas. Com
backpressure, isso não derruba o servidor no instante em que você reconecta — vai no
ritmo que a sua conexão aguenta.

### Lugar 4 (fase posterior) — Arquivar mensagens no banco

Um processo que lê o "rio" de todas as mensagens e grava no Postgres **em lotes**
(ex: a cada 200 mensagens ou a cada 2 segundos). Entrada rápida, saída em lote mais
lenta → backpressure mantém estável. Bom exercício, mas depois.

### Onde NÃO vamos usar stream

- **Criar usuário, adicionar amigo, listar salas, virar membro de sala:** pedido →
  resposta simples, payload pequeno. HTTP normal com JSON. Stream não agrega nada.
- **Mandar UMA mensagem do cliente para o servidor:** é um objeto pequeno e único.
  O valor da stream está na **entrega / fan-out** (Lugar 1), não no envio individual.

---

## 9. Por que stream é bom NESTE projeto (resumo)

1. Chat = fluxo infinito de dados no tempo → é o modelo exato para o qual stream foi feita.
2. Muitos clientes com velocidades muito diferentes → backpressure evita estouro de memória.
3. Histórico pode ser enorme → streaming mantém memória constante.
4. É o projeto ideal para **sentir** backpressure na prática: dá para simular um cliente
   lento em poucas linhas e ver a origem freando.

---

## 10. Glossário rápido

| Termo | Significado curto |
|-------|-------------------|
| **chunk** | um pedaço de dado que passa pela stream (no nosso caso, um objeto de mensagem) |
| **Readable** | stream de onde você lê |
| **Writable** | stream para onde você escreve |
| **Transform** | stream que recebe, modifica e repassa |
| **Duplex** | stream que lê e escreve ao mesmo tempo (ex: socket) |
| **backpressure** | mecanismo que faz a origem desacelerar quando o destino não dá conta |
| **`drain`** | evento do Writable avisando "esvaziei, pode mandar mais" |
| **`highWaterMark`** | tamanho do buffer interno da stream (bytes; ou nº de objetos em object mode) |
| **object mode** | modo em que os chunks são objetos JS, não bytes |
| **`pipe()` / `pipeline()`** | conectam streams e cuidam do backpressure automaticamente |
| **Redis Streams** | estrutura de dados do Redis (armazém), diferente de Node Stream |
