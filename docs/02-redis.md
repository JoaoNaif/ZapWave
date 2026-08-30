# 02 — Redis: o que é, diferença para o Postgres e por que é o "principal" no ZapWave

> Objetivo deste documento: entender **o que o Redis é**, **como ele difere do Postgres**,
> **por que ele é a peça central deste projeto** e **por que o Mongo não o substitui**.

---

## 1. A diferença fundamental: RAM vs disco

| | **Postgres** | **Redis** |
|---|---|---|
| Onde os dados vivem | **disco** | **memória RAM** (com backup opcional em disco) |
| Velocidade típica | milissegundos | sub-milissegundo / microssegundos |
| Modelo de dados | tabelas + relações + SQL | chave → estrutura simples (string, hash, list, set, sorted set, stream) |
| Durabilidade | forte (ACID, transações, constraints) | ajustável, mais fraca por padrão (pode perder os últimos segundos se o processo cair) |
| Bom para | consultas complexas, joins, guardar para sempre | leitura/escrita rápida, dados efêmeros, tempo real |
| Custo por GB | barato | caro (RAM é cara) |

**Analogia:** Postgres é o **almoxarifado** — tudo guardado, organizado, permanente, mas
você anda até lá para pegar. Redis é a **mesa de trabalho** — só o que você está usando
agora, ao alcance da mão, resposta imediata, mas espaço limitado e não é lugar de
guardar para sempre.

Não é "um melhor que o outro" — são ferramentas para funções diferentes, e é comum
usar os dois juntos.

---

## 2. Por que Redis no ZapWave — e por que ele é o "principal"

O coração de um chat em tempo real é:

- mensagem chega → precisa alcançar os usuários online em **milissegundos**
- saber **quem está online agora**
- segurar mensagens **não entregues** e **repetir** na reconexão

Tudo isso é **alta frequência**, **sensível a latência** e **de curta duração** (uma
mensagem importa mais nos segundos após ser enviada; "online" não significa nada depois
de alguns segundos sem sinal de vida). É exatamente o ponto forte do Redis.

Se cada mensagem enviada e cada consulta "quem está nesta sala?" batesse no Postgres
(disco, relacional), ele viraria gargalo.

**Redis é o "principal" no sentido de *onde está a ação*** — a maior parte do código
interessante do projeto conversa com o Redis. **Não** no sentido de "única fonte da
verdade": contas de usuário, amizades e histórico de longo prazo devem viver num banco
durável (Postgres). O Redis guarda a **cópia de trabalho / janela recente / estado
efêmero**.

---

## 3. "Redis é não relacional" — o Mongo substituiria?

Cuidado com a palavra **NoSQL**: ela junta ferramentas muito diferentes num guarda-chuva
só. Mongo e Redis são ambos "NoSQL", mas **não são o mesmo tipo de coisa**.

| | O que é | Substitui o quê |
|---|---------|-----------------|
| **Mongo** | banco de **documentos**, em **disco**. "Postgres com documentos JSON em vez de tabelas". Fonte da verdade, com índices e consultas. | substitui o **Postgres** |
| **Redis** | armazém de estruturas de dados **em memória**. Complemento, usado por velocidade e estado efêmero/tempo real. | não é substituído por Mongo |

- **Mongo pode substituir o Postgres** neste projeto (guardar usuários, mensagens, etc.
  como documentos). ✅
- **Mongo não substitui bem o Redis.** ❌

---

## 4. O que o Redis tem a favor que Mongo/Postgres não têm de forma nativa

1. **Velocidade em memória** como ponto de design — não é um cache pregado por cima,
   é o modelo inteiro.
2. **TTL por chave** (expiração automática). Presença:
   `SET user:123:online 1 EX 30` — a chave **some sozinha** em 30s se não houver
   heartbeat. Postgres/Mongo não têm "esta linha se apaga em 30 segundos" com essa
   precisão (Mongo tem TTL index, mas é uma varredura de fundo grosseira, ~1x/min).
3. **Redis Streams + consumer groups + PEL** (Pending Entries List) — é literalmente o
   recurso "mensagens pendentes" + "replay na reconexão" **pronto**. Em Postgres/Mongo
   você teria que reconstruir isso na mão.
4. **Pub/Sub** — disparo instantâneo de eventos entre várias instâncias do app.
5. **Estruturas de dados prontas** — "usuários online ordenados por visto por último" é
   **um comando** com sorted set. Contadores atômicos idem.
6. **Leituras bloqueantes** (`XREAD BLOCK`, `BLPOP`) — "espera até chegar uma mensagem
   nova" sem ficar consultando em loop (polling).

**Dá para construir o chat só com Mongo?** Tecnicamente sim, com polling e lógica de
pendentes feita à mão — mas seria reimplementar, mais devagar, o que o Redis dá de
graça; e perde o valor de aprendizado (o projeto é sobre streams + o primitivo de
Redis Streams).

**Dá para construir só com Redis (sem Postgres)?** Por um tempo sim (ele persiste em
disco via RDB/AOF). Mas o custo de RAM e o fato de não ser feito para consultas
históricas ricas ("todas as mensagens do usuário X em março com a palavra 'foo'") fazem
você querer um banco durável depois.

> **Plano:** começar só com Redis; adicionar Postgres numa fase posterior como arquivo
> durável.

---

## 5. Mapa: o que vai em cada um no ZapWave

| Dado | Onde | Por quê |
|------|------|---------|
| Contas de usuário, credenciais | Postgres | durável, fonte da verdade, muda pouco |
| Amizades (`Friendship`) | Postgres | durável, relacional |
| Salas + lista de membros (config) | Postgres | durável |
| Quem está online na sala agora | Redis | efêmero, muda o tempo todo |
| Mensagens — janela recente | Redis Streams (`room:{id}` / inbox por usuário) | entrega, replay, pendentes |
| Mensagens — histórico completo | Postgres (arquivado por um consumer, fase posterior) | consultas, durabilidade |
| Presença / "online agora" | Redis (chave com TTL + heartbeat, ou sorted set por last-seen) | expira sozinho |
| Mensagens pendentes / não entregues | Redis Streams (PEL) | primitivo nativo |
| Contador de notificações não lidas | Redis (incremento atômico) | rápido, frequente |

---

## 6. Modelo mental de bolso

- **Postgres (ou Mongo)** = fonte da verdade, durável, consultas ricas. **Disco.**
- **Redis** = estado quente, tempo real, efêmero, rápido. **RAM.**
- **Mongo substitui o Postgres, não o Redis.**
- Redis é "principal" no ZapWave porque o coração do projeto (entrega em tempo real,
  presença, pendentes, replay) vive nele — "principal" = onde está a ação, não = única
  fonte da verdade.

---

## 7. Glossário rápido

| Termo | Significado curto |
|-------|-------------------|
| **in-memory** | dados guardados na RAM, não no disco → acesso muito rápido, volátil |
| **TTL** | "time to live"; tempo após o qual a chave se apaga sozinha |
| **RDB / AOF** | formas de o Redis salvar cópia dos dados em disco (snapshot / log de comandos) |
| **Pub/Sub** | publicar/assinar: emissor manda mensagem para canais, assinantes recebem na hora (sem histórico) |
| **sorted set** | conjunto ordenado por um score numérico; ótimo para ranking e "por tempo" |
| **ACID** | garantias de transação de bancos relacionais (atomicidade, consistência, isolamento, durabilidade) |
| **NoSQL** | guarda-chuva para bancos não relacionais; junta coisas bem diferentes (Mongo, Redis, Cassandra...) |
| **PEL** | Pending Entries List — lista de mensagens entregues a um consumer mas ainda não confirmadas (ver doc 05) |
