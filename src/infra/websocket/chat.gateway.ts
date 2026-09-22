import { Logger } from '@nestjs/common'
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets'
import { IncomingMessage } from 'node:http'
import { WebSocket } from 'ws'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { startDeliveryPipeline } from '../streams/delivery-pipeline'
import { WsAuthService } from './ws-auth'

// Códigos de fechamento privados (4000-4999, livres por RFC 6455 — não
// colidem com os 1000-2999 reservados pro protocolo/frameworks).
const CLOSE_UNAUTHORIZED = 4401

@WebSocketGateway({ path: '/ws' })
export class ChatGateway implements OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name)

  constructor(
    private wsAuth: WsAuthService,
    private messageStream: MessageStream
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    const context = await this.wsAuth.authenticate(request)

    if (!context) {
      client.close(CLOSE_UNAUTHORIZED, 'unauthorized')
      return
    }

    const { device } = context
    const deviceId = device.id.toString()

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
}
