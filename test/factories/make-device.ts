import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Device, DeviceProps } from '@/domain/accounts/entities/device'
import { faker } from '@faker-js/faker'

export function makeDevice(
  override: Partial<DeviceProps> = {},
  id?: UniqueEntityId
) {
  const device = Device.create(
    {
      userId: new UniqueEntityId(),
      name: faker.helpers.arrayElement([
        'Chrome no Windows',
        'App iOS',
        'Firefox',
      ]),
      resumeCursorId: null,
      ...override,
    },
    id
  )

  return device
}
