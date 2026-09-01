import { Device } from '../../entities/device'

export abstract class DevicesRepository {
  abstract findById(id: string): Promise<Device | null>
  abstract findManyByUserId(userId: string): Promise<Device[]>
  abstract create(device: Device): Promise<void>
  abstract save(device: Device): Promise<void>
}
