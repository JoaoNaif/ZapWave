import { Writable } from 'node:stream'
import { WebSocket } from 'ws'

// O ponto onde o backpressure vira real: ws.send() só chama o callback quando
// o frame realmente sai pro socket. Enquanto o client não escoa (3G lento),
// esse callback demora — o Writable segura o "ok, pode mandar mais" — e é
// isso que faz o pipeline() parar de puxar Message novas do Redis. Sem essa
// ponte, a stream inteira vira um EventEmitter disfarçado (ver docs/01 §5).
export function createWsWritable(socket: WebSocket): Writable {
  const writable = new Writable({
    write(frame: string, _encoding, callback) {
      if (socket.readyState !== WebSocket.OPEN) {
        callback(new Error('socket não está aberto'))
        return
      }

      socket.send(frame, (error) => callback(error ?? null))
    },
  })

  socket.once('close', () => writable.destroy())

  return writable
}
