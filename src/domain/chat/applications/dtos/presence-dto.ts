export interface PresenceDto {
  userId: string
  online: boolean
  lastSeenAt: Date | null
}
