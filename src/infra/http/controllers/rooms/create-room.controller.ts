import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { CreateRoomUseCase } from '@/domain/rooms/applications/use-cases/create-room'

const createRoomBodySchema = z.object({
  name: z.string(),
})

type CreateRoomBodySchema = z.infer<typeof createRoomBodySchema>

@Controller()
export class CreateRoomController {
  constructor(private createRoom: CreateRoomUseCase) {}

  @Post('/room')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(createRoomBodySchema))
    body: CreateRoomBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { name } = body

    const result = await this.createRoom.execute({
      userId,
      name,
    })

    const { owner, room } = result.value

    return {
      room,
      owner,
    }
  }
}
