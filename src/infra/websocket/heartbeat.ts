import { WebSocket } from 'ws'
import { Presence } from '@/domain/chat/applications/gateways/presence'

// Ping em janelas curtas, bem abaixo da janela de tolerância do Presence
// (45s — ver redis-presence.ts): sobrevive a 1 ping perdido sem virar
// offline à toa. ping()/pong() são frames de controle do protocolo WS —
// nenhum client (browser ou `ws`) precisa de código pra responder, é
// automático (ver docs/05-websocket.md §7).
const PING_INTERVAL_MS = 20_000

// Marca o usuário online no connect (não espera o primeiro ping) e depois a
// cada pong. Não existe "marcar offline" no close — a ausência de heartbeat
// é o que expira sozinho (ver docs/05 §7).
export function startHeartbeat(
  socket: WebSocket,
  presence: Presence,
  userId: string
): void {
  void presence.heartbeat(userId)

  const interval = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.ping()
  }, PING_INTERVAL_MS)

  socket.on('pong', () => {
    void presence.heartbeat(userId)
  })

  socket.once('close', () => clearInterval(interval))
}
