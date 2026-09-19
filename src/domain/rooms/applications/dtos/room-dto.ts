export interface RoomDto {
  id: string
  name: string | null
  type: 'dm' | 'room'
  createdById: string
  createdAt: Date
}
