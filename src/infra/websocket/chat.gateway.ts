import { Logger } from '@nestjs/common'
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets'
import { IncomingMessage } from 'node:http'
import { WebSocket } from 'ws'
import z from 'zod'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Presence } from '@/domain/chat/applications/gateways/presence'
import { AckMessageDeliveryUseCase } from '@/domain/chat/applications/use-cases/ack-message-delivery'
import { startDeliveryPipeline } from '../streams/delivery-pipeline'
import { startHeartbeat } from './heartbeat'
import { WsAuthService } from './ws-auth'

// Códigos de fechamento privados (4000-4999, livres por RFC 6455 — não
// colidem com os 1000-2999 reservados pro protocolo/frameworks).
const CLOSE_UNAUTHORIZED = 4401

const clientFrameSchema = z.object({
  type: z.literal('ack'),
  messageId: z.string().ulid(),
})

@WebSocketGateway({ path: '/ws' })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name)

  constructor(
    private wsAuth: WsAuthService,
    private messageStream: MessageStream,
    private presence: Presence,
    private ackMessageDelivery: AckMessageDeliveryUseCase
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    const context = await this.wsAuth.authenticate(request)

    if (!context) {
      client.close(CLOSE_UNAUTHORIZED, 'unauthorized')
      return
    }

    const { userId, device } = context
    const deviceId = device.id.toString()

    startHeartbeat(client, this.presence, userId)

    // Servidor → cliente é o pipeline de stream (backpressure real).
    // Cliente → servidor é só ack, um frame pequeno e raro — não precisa de
    // stream, EventEmitter (aqui, o listener 'message' do próprio ws) já
    // serve (ver docs/01-streams.md §5).
    client.on('message', (raw) => {
      this.handleClientFrame(raw, userId, deviceId, client)
    })

    startDeliveryPipeline(
      this.messageStream,
      deviceId,
      device.resumeCursorId?.toString() ?? null,
      client
    ).catch((error) => {
      // socket fechado é o caso normal de saída do pipeline, não um erro
      if (client.readyState === WebSocket.CLOSED) return

      this.logger.error(
        `pipeline do device ${deviceId} caiu: ${error instanceof Error ? error.message : error}`
      )
    })
  }

  private async handleClientFrame(
    raw: Buffer | ArrayBuffer | Buffer[],
    userId: string,
    deviceId: string,
    client: WebSocket
  ) {
    let frame: z.infer<typeof clientFrameSchema>
    try {
      frame = clientFrameSchema.parse(JSON.parse(raw.toString()))
    } catch {
      // frame malformado: não é HTTP, não tem status code pra devolver —
      // ignora, o pior caso é o cliente reenviar (mesma tolerância do ack
      // cumulativo)
      return
    }

    const result = await this.ackMessageDelivery.execute({
      userId,
      deviceId,
      messageId: frame.messageId,
    })

    const acknowledged = result.isRight() ? result.value.acknowledged : false

    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'ack-result',
          messageId: frame.messageId,
          acknowledged,
        })
      )
    }
  }
}
