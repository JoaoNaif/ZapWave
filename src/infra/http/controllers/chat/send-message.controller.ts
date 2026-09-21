import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { SendMessageUseCase } from '@/domain/chat/applications/use-cases/send-message'

const sendMessageBodySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  clientMessageId: z.string().uuid().optional(),
})

type SendMessageBodySchema = z.infer<typeof sendMessageBodySchema>

@Controller()
export class SendMessageController {
  constructor(private sendMessage: SendMessageUseCase) {}

  @Post('/message')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(sendMessageBodySchema))
    body: SendMessageBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { conversationId, body: messageBody, clientMessageId } = body

    const result = await this.sendMessage.execute({
      senderId: userId,
      conversationId,
      body: messageBody,
      clientMessageId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { message } = result.value

    return {
      message,
    }
  }
}
