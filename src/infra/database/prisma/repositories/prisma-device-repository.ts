import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Device } from '@/domain/accounts/entities/device'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { PrismaDeviceMapper } from '../mappers/prisma-device-mapper'

@Injectable()
export class PrismaDevicesRepository implements DevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Device | null> {
    const device = await this.prisma.device.findUnique({
      where: { id },
    })

    if (!device) {
      return null
    }

    return PrismaDeviceMapper.toDomain(device)
  }

  async findManyByUserId(userId: string): Promise<Device[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId },
    })

    return devices.map(PrismaDeviceMapper.toDomain)
  }

  async create(device: Device): Promise<void> {
    const data = PrismaDeviceMapper.toPrisma(device)

    await this.prisma.device.create({
      data,
    })
  }

  async save(device: Device): Promise<void> {
    const data = PrismaDeviceMapper.toPrisma(device)

    await this.prisma.device.update({
      where: { id: device.id.toString() },
      data,
    })
  }
}
