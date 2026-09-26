# 05 — WebSocket: handshake, entrega e reconexão

> Objetivo deste documento: registrar como a conexão WS autentica, identifica o device, e
> como liga no pipeline de Node stream que entrega mensagem em tempo real. Ver
> [01](./01-streams.md) para o pipeline em si, [06](./06-redis-streams.md) para o que ele
> consome do Redis.

---

## 1. Handshake: cookie + `deviceId` na query string

O upgrade WS é, por baixo, um request HTTP — o cookie `access_token` (setado no login) vai
junto automaticamente. Mas o upgrade **não passa pelo `cookie-parser`** nem pelos guards
HTTP normais (foge do pipeline do Express), então `ws-auth.ts` extrai e valida o JWT à
mão, direto do header `Cookie` bruto (com fallback pra `Authorization: Bearer`, pro mesmo
client não-browser que já usa isso na API HTTP).

O JWT carrega `sub` (userId) e `deviceId` (o device criado naquele login). Mesmo assim, o
handshake do WS pede o `deviceId` também na URL: `ws://.../ws?deviceId=<uuid>` — hoje o
servidor usa o da URL, não o do token. Ele confere que esse device existe, pertence a esse
userId e não foi revogado (mesma checagem que já existe em `AckMessageDeliveryUseCase`).
Qualquer falha em qualquer uma dessas etapas fecha o socket com o mesmo código — de
propósito, pra não vazar pro cliente qual validação especificamente falhou.

**Por que query string e não primeira mensagem:** dá pra rejeitar a conexão **antes** dela
ser aceita, sem gastar um round-trip aceitando o socket pra só depois fechar.

**Checagem de `Origin`:** o CORS **não vale pra WebSocket** — qualquer página aberta no
navegador do usuário consegue abrir um WS pro nosso servidor, e o navegador manda o cookie
`access_token` junto (o chamado *cross-site WebSocket hijacking*). Quem barra isso é o
header `Origin`, que o navegador preenche sozinho e a página não consegue forjar. O
`ws-auth.ts` compara com a mesma lista do CORS (`CORS_ORIGINS`, hoje só localhost): `Origin`
fora da lista = recusado, antes mesmo de olhar o token. **Sem `Origin`** (curl, app nativo,
teste) passa — esse não é o risco, e continua precisando de token válido.

## 2. Códigos de fechamento

`4401` para qualquer falha de autenticação/autorização do handshake (token ausente ou
inválido, `deviceId` ausente, device de outro usuário, device revogado, `Origin` não
permitido) e também para o fechamento de um socket **já aberto** quando o device é
revogado (§9). Faixa 4000-4999 é
de uso privado por aplicação (RFC 6455) — não colide com os códigos 1000-2999 reservados
pro protocolo.

## 3. De onde vem o `resumeCursorId` da reconexão

O servidor **não confia no cliente** pra dizer "de onde eu parei" — usa o
`Device.resumeCursorId` já durável no Postgres (atualizado no `PUT /message-ack`, ver
[03](./03-entidades.md) §4). Evita depender de um valor que o cliente pode perder ou mentir,
e evita mais uma volta de rede no handshake.

## 4. Replay + live num pipeline só

`replayFrom` (finito) e `subscribe` (infinito) são combinados num generator só
(`resumeThenLive`, em `device-inbox.readable.ts`) antes de virar o `Readable`. Os dois lêem
do mesmo consumer group Redis, então não existe brecha entre "acabou o replay" e "começou o
live" onde uma mensagem pudesse escapar (ver [06](./06-redis-streams.md) §3).

## 5. ACK: WS e HTTP, os dois, chamando o mesmo use-case

O cliente pode confirmar de dois jeitos, e ambos terminam exatamente no mesmo
`AckMessageDeliveryUseCase` — não existe regra duplicada:

- **HTTP** `PUT /message-ack` (`deviceId` + `messageId` no body) — continua existindo pro
  caso "cliente confirma mesmo com o WS caído" (ex.: leu uma push notification com o app
  fechado).
- **WS**: o cliente manda um frame `{ "type": "ack", "messageId": "..." }` na própria
  conexão já aberta. O gateway responde com
  `{ "type": "ack-result", "messageId": "...", "acknowledged": boolean }`.

No caminho WS, `userId` e `deviceId` **não vêm no frame** — já foram resolvidos no
handshake (§1) e ficam fechados (closure) no listener de `'message'` daquela conexão. O
cliente não pode alegar ser outro device pelo frame; só o que o handshake já autenticou.

**Por que não usar Node stream aqui:** cliente → servidor é um frame pequeno e raro (um
ack por mensagem lida), o oposto do fluxo contínuo servidor → cliente que motiva o
pipeline. O listener `'message'` do próprio `ws` (um `EventEmitter`) já é suficiente — é
exatamente a distinção do [doc 01](./01-streams.md) §5: EventEmitter para eventos
pontuais e leves, stream para fluxo contínuo. Um frame que não é JSON válido ou não bate
com o schema é apenas ignorado (não é HTTP, não tem status code pra devolver).

## 6. Heartbeat e presença

`heartbeat.ts` liga cada conexão autenticada ao `Presence` (`RedisPresence`). Estrutura:
**um sorted set global** (`presence:online`), sem partição por sala — membro = `userId`,
score = epoch ms do último heartbeat. "Online" = score dentro dos últimos 45s; "visto por
último" é o próprio score, sempre disponível (o mesmo dado serve pros dois, sem chave
separada). Diferente do inbox de mensagens ([06](./06-redis-streams.md)), aqui não é Redis
Streams — é só `ZADD`/`ZSCORE`, sem consumer group, porque não há "pendência" nem "replay"
pra presença: cada heartbeat sobrescreve o anterior, não se acumula.

Fluxo da conexão:

- No `handleConnection`, marca o usuário online **na hora** (não espera o primeiro ping).
- A cada 20s manda um `ping()` — frame de controle do protocolo WS, não uma mensagem de
  app. Nenhum cliente (browser ou o pacote `ws`) precisa de código pra responder: o
  `pong` é automático, faz parte do protocolo (RFC 6455).
- Cada `pong` recebido chama `presence.heartbeat(userId)` de novo, renovando a janela de
  "online" (45s — bem maior que os 20s do ping, sobrevive a 1 ping perdido sem oscilar).
- **Não existe "marcar offline" no `close`.** A ausência de heartbeat é o que expira
  sozinho — combina com multi-device: se um usuário tem 2 conexões e fecha uma, a outra
  continua mandando heartbeat, e ele nunca aparenta ficar offline por engano.
- **Conexão morta é derrubada.** Cada ping marca a conexão como "esperando pong"; se no
  ping seguinte (20s depois) o `pong` não chegou, o servidor chama `socket.terminate()`.
  Sem isso, um celular que perdeu a rede sem fechar o socket (o `close` nunca chega) ficava
  pendurado pra sempre — e cada conexão pendurada segura um `Readable`, um pipeline e uma
  conexão Redis dedicada (ver §8). O `terminate()` dispara o `close`, e a cadeia de
  limpeza do §7 se desfaz sozinha.

Presença é por **usuário**, não por device (diferente do inbox/PEL, que é por device) —
"fulano está online" não depende de qual aparelho especificamente. `GET /presence/:userId`
expõe isso pra HTTP.

## 7. Onde o backpressure vira palpável

```
RedisMessageStream.subscribe/replayFrom (AsyncIterable)
  → device-inbox.readable.ts   Readable.from(..., { objectMode: true })
  → enrich.transform.ts        Transform: Message → frame JSON
  → ws.writable.ts             Writable: frame → socket.send()
       (tudo amarrado por pipeline(), em delivery-pipeline.ts)
```

`ws.writable.ts` é o ponto que importa: `socket.send(frame, callback)` só chama o
`callback` quando o frame **realmente** saiu para o socket. Cliente lento (3G) → callback
demora → `pipeline()` para de puxar o próximo item do `Readable` → o `AsyncIterable` do
Redis para de chamar `.next()` → o `RedisMessageStream` para de fazer `XREADGROUP` para
**aquele** device, e só para aquele. Nenhum buffer intermediário nosso cresce — é isso que
o projeto inteiro existe pra demonstrar (ver [01](./01-streams.md) §4).

Quando o socket fecha, `ws.writable.ts` destrói o `Writable`; `pipeline()` propaga o
destroy pro `Readable`, que chama `.return()` no generator `resumeThenLive` — que se
propaga pros generators do `MessageStream`, fechando a conexão Redis duplicada
(`redis.duplicate()`, ver [06](./06-redis-streams.md) §6). A cadeia inteira se desfaz
sozinha a partir de um único evento.

## 8. Limite de escala: uma conexão Redis por device conectado

Cada device conectado mantém **uma conexão Redis própria e bloqueada** num `XREADGROUP
BLOCK` (`redis.duplicate()`, ver [06](./06-redis-streams.md) §6) — não dá pra dividir uma
conexão entre leitores bloqueantes, porque o comando ocupa a conexão inteira até
responder. Consequência: **N devices online = N conexões Redis abertas**. O Redis aceita
milhares (`maxclients`, padrão 10.000), então pro escopo do projeto não é problema — mas é
o primeiro teto que aparece se o número de conexões simultâneas crescer.

Se um dia for preciso passar disso, os caminhos são: um único leitor por processo fazendo
`XREADGROUP` em várias chaves de uma vez e distribuindo pros sockets (troca conexões por
código de roteamento), ou Pub/Sub por cima do Redis Streams (só o "acorda" vai por
Pub/Sub, a leitura de fato continua sendo `XREADGROUP` sem `BLOCK`). **Decisão por ora:**
não fazer nada — a simplicidade de "1 device = 1 pipeline = 1 conexão" é justamente o que
deixa o backpressure por device fácil de enxergar.

## 9. Revogar sessão: corta o HTTP e fecha o socket aberto

O JWT vale 24h e, sozinho, não sabe que foi revogado. Duas peças resolvem:

**HTTP — `deviceId` no token + cache no Redis.** O `JwtStrategy` (`jwt-strategy.ts`), depois
de conferir assinatura e validade, pergunta ao `DeviceSessionCache` se o `deviceId` do token
ainda está ativo. Ir ao Postgres a cada request seria desperdício, então o Redis fica na
frente (`device-session:<deviceId>` = `active` | `revoked`):

- **Leitura (`isActive`):** olha o Redis; se não tem nada, pergunta ao Postgres
  (`Device.revokedAt`) e guarda `active` por 5 min. Postgres continua sendo a verdade.
- **Revogação (`markRevoked`):** o `RevokeDeviceUseCase` grava no Postgres e depois chama o
  `SessionGateway`; o adapter grava `revoked` no Redis (por 24h, a vida do token) — vale na
  hora, em qualquer instância. Os 5 min do `active` são só um seguro pro caso do Redis ter
  falhado exatamente nesse instante.
- **`SET ... NX` no `active`:** se uma revogação chegar entre a leitura do Postgres e a
  gravação do cache, o `revoked` dela não pode ser sobrescrito pelo `active` velho.
- **Redis fora do ar:** o cache é opcional. Erro de leitura vira "não sei" e a checagem cai
  no Postgres; só fica mais lento, nunca deixa de checar.
- **Token sem `deviceId`** (de antes disso existir) é recusado: a sessão precisa ser refeita.

**WebSocket — `ConnectionRegistry`.** Um mapa `deviceId → sockets` em memória
(`connection-registry.ts`), preenchido no `handleConnection`. O adapter `WsSessionGateway`
(implementa o port `SessionGateway`) chama `closeAll(deviceId, 4401)` e o socket daquele
device cai na hora. Depois de registrar o socket, o gateway confere o cache mais uma vez:
fecha a brecha de um device revogado *durante* o handshake, entre o `authenticate` ler o
Postgres e o socket entrar no mapa.

Só o device revogado cai — outras sessões do mesmo usuário (outros aparelhos) seguem
normais. **Limite conhecido:** o `ConnectionRegistry` é por processo. Com mais de uma
instância do servidor, o HTTP já é cortado em todas (o cache é o Redis compartilhado), mas
o socket só fecha na instância que recebeu o pedido de revogação; nas outras ele segue
aberto até o cliente cair por conta própria (a reconexão, essa sim, é recusada). Fechar de
imediato em todas exigiria Pub/Sub no Redis avisando "feche o device X" — não feito por
ora, pelo mesmo motivo do §8.

## 10. O que fica para depois

- Multi-tab / múltiplas conexões pro mesmo device (ver [06](./06-redis-streams.md) §1).
- "Fulano está digitando" — mesmo raciocínio do §5 (EventEmitter, evento pontual), ainda
  não implementado.
- "Membros online de uma sala" — hoje só existe consulta por usuário
  (`GET /presence/:userId`); um endpoint em lote (várias `userId` de uma vez, ou por
  conversa) ainda não existe.
