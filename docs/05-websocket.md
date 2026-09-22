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

O JWT só carrega `sub` (userId) — não diz **qual device**. O cliente manda isso à parte,
na URL: `ws://.../ws?deviceId=<uuid>`. O servidor então confere que esse device existe,
pertence a esse userId e não foi revogado (mesma checagem que já existe em
`AckMessageDeliveryUseCase`). Qualquer falha em qualquer uma dessas etapas fecha o socket
com o mesmo código — de propósito, pra não vazar pro cliente qual validação especificamente
falhou.

**Por que query string e não primeira mensagem:** dá pra rejeitar a conexão **antes** dela
ser aceita, sem gastar um round-trip aceitando o socket pra só depois fechar.

## 2. Códigos de fechamento

`4401` para qualquer falha de autenticação/autorização do handshake (token ausente ou
inválido, `deviceId` ausente, device de outro usuário, device revogado). Faixa 4000-4999 é
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

## 5. O ACK continua sendo HTTP

`PUT /message-ack` (já existente) confirma a mensagem — a conexão WS só entrega, não
recebe confirmação pelo mesmo canal ainda. Simplifica o gateway (só server → client nesta
fase) e o endpoint HTTP já cobre o caso "cliente confirma mesmo com o WS caído". Virar
ack por WS é um refinamento de fase posterior, não bloqueia nada hoje.

## 6. Onde o backpressure vira palpável

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

## 7. O que fica para depois

- Heartbeat / `Presence` (`RedisPresence`) — porta separada, ainda não implementada.
- Ack via WS (em vez de só HTTP).
- Multi-tab / múltiplas conexões pro mesmo device (ver [06](./06-redis-streams.md) §1).
