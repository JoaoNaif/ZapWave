import { User } from '../../entities/user'
import { UserDto } from '../dtos/user-dto'
import { UserSummaryDto } from '../dtos/user-summary-dto'

export class UserMapper {
  static toSummaryDto(user: User): UserSummaryDto {
    return {
      id: user.id.toString(),
      username: user.username,
      displayName: user.displayName,
    }
  }

  static toDto(user: User): UserDto {
    return {
      id: user.id.toString(),
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }
  }
}
