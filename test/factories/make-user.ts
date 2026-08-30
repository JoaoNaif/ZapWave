import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { User, UserProps } from '@/domain/accounts/entities/user'
import { faker } from '@faker-js/faker'

export function makeUser(
  override: Partial<UserProps> = {},
  id?: UniqueEntityId
) {
  const user = User.create(
    {
      email: faker.internet.email(),
      passwordHash: faker.internet.password(),
      displayName: faker.person.fullName(),
      username: faker.person.firstName(),
      ...override,
    },
    id
  )

  return user
}
