import { UseCaseError } from '@/core/errors/use-case-error'

export class FriendshipNotAcceptedError extends Error implements UseCaseError {
  constructor() {
    super(`Friendship is not accepted.`)
  }
}
