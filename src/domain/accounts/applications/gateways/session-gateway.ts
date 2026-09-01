/**
 * Port do tempo real das sessões.
 *
 * O domínio só sabe "encerre a sessão viva deste device". Quem implementa
 * (infra) fecha o WebSocket aberto daquele device, se houver um; se o device
 * estiver offline, é no-op. Nunca lança por causa de sessão inexistente.
 *
 * Impl. real: adapter em cima do `ws` (infra/websocket).
 * Fake (test): `FakeSessionGateway` — só registra os deviceIds desconectados.
 */
export abstract class SessionGateway {
  abstract disconnect(deviceId: string): Promise<void>
}
