import { Injectable } from '@nestjs/common'
import { WebSocket } from 'ws'

/**
 * Quem está conectado agora, por device. Existe pra o servidor conseguir
 * fechar de fora a conexão de um device específico (revogar sessão) — o
 * ChatGateway só enxerga o socket dentro do próprio handleConnection.
 *
 * Em memória do processo: com mais de uma instância do servidor, cada uma só
 * conhece os seus sockets (ver docs/05-websocket.md §9).
 */
@Injectable()
export class ConnectionRegistry {
  private readonly sockets = new Map<string, Set<WebSocket>>()

  add(deviceId: string, socket: WebSocket) {
    let group = this.sockets.get(deviceId)
    if (!group) {
      group = new Set()
      this.sockets.set(deviceId, group)
    }
    group.add(socket)

    // sai sozinho quando o socket fecha, por qualquer motivo (cliente,
    // terminate() do heartbeat, closeAll)
    socket.once('close', () => {
      group.delete(socket)
      if (group.size === 0 && this.sockets.get(deviceId) === group) {
        this.sockets.delete(deviceId)
      }
    })
  }

  closeAll(deviceId: string, code: number, reason: string) {
    // cópia: o 'close' de cada socket mexe no Set original
    for (const socket of [...(this.sockets.get(deviceId) ?? [])]) {
      socket.close(code, reason)
    }
  }

  countFor(deviceId: string) {
    return this.sockets.get(deviceId)?.size ?? 0
  }
}
