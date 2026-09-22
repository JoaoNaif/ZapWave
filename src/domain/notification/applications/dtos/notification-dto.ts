export interface NotificationDto {
  id: string
  recipientId: string
  title: string
  content: string
  readAt: Date | null
  createdAt: Date
}
