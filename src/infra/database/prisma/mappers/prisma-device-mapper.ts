import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Device } from '@/domain/accounts/entities/device'
import { Prisma, Device as PrismaDevice } from '@prisma/client'

export class PrismaDeviceMapper {
  static toDomain(raw: PrismaDevice): Device {
    return Device.create(
      {
        userId: new UniqueEntityId(raw.userId),
        name: raw.name,
        createdAt: raw.createdAt,
        lastSeenAt: raw.lastSeenAt,
        resumeCursorId: raw.resumeCursorId
          ? new UniqueEntityId(raw.resumeCursorId)
          : null,
        revokedAt: raw.revokedAt,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(device: Device): Prisma.DeviceUncheckedCreateInput {
    return {
      id: device.id.toString(),
      userId: device.userId.toString(),
      name: device.name,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      resumeCursorId: device.resumeCursorId?.toString() ?? null,
      revokedAt: device.revokedAt,
    }
  }
}
