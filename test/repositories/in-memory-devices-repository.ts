import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Device } from '@/domain/accounts/entities/device'

export class InMemoryDevicesRepository implements DevicesRepository {
  public items: Device[] = []

  async findById(id: string): Promise<Device | null> {
    const device = this.items.find((item) => item.id.toString() === id)

    if (!device) {
      return null
    }

    return device
  }

  async findManyByUserId(userId: string): Promise<Device[]> {
    return this.items.filter((item) => item.userId.toString() === userId)
  }

  async create(device: Device): Promise<void> {
    this.items.push(device)
  }

  async save(device: Device): Promise<void> {
    const itemIndex = this.items.findIndex((item) => item.id === device.id)

    this.items[itemIndex] = device
  }
}
