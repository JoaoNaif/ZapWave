# Documentação do ZapWave

Chat em tempo real feito para **entender streams no Node a fundo**. Cada assunto vive
em um `.md` próprio, numerado na ordem em que faz sentido ler.

## Índice

| # | Documento | Assunto |
|---|-----------|---------|
| 01 | [01-streams.md](./01-streams.md) | O que é stream no Node, backpressure, stream vs EventEmitter, e **onde exatamente** vamos usar stream no ZapWave (e onde não) |
| 02 | [02-redis.md](./02-redis.md) | Redis vs Postgres (RAM vs disco), por que Redis é a peça central do projeto, por que o Mongo não o substitui, e o mapa de o que vai em cada banco |
| 03 | [03-entidades.md](./03-entidades.md) | Entidades e tabelas (`User`, `Friendship`, `Conversation`, `ConversationMember`, `Message`, `Device`, `RoomInvite`, `Notification`), inbox por device, o que vive no Redis, e os fluxos principais |
| 04 | [04-arquitetura.md](./04-arquitetura.md) | Camadas (core / domain / infra), regra de dependência, árvore de pastas completa, ports × adapters × fakes, e o fluxo de uma requisição |

> Próximos documentos previstos (ainda não escritos):
> - `05-websocket.md` — transporte, heartbeat, ACK, sessão e reconexão
> - `06-redis-streams.md` — `XADD`/`XREAD`/consumer groups/PEL e como se conecta aos Node streams
> - `07-fases.md` — roteiro de implementação em fases

## Como usar esta pasta

Sempre que bater uma dúvida de conceito, consulte o `.md` do assunto antes de
codar. Se a dúvida não estiver coberta, escreva a resposta aqui depois de resolvê-la.
