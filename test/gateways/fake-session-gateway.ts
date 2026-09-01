import { SessionGateway } from '@/domain/accounts/applications/gateways/session-gateway'

export class FakeSessionGateway implements SessionGateway {
  public disconnected: string[] = []

  async disconnect(deviceId: string): Promise<void> {
    this.disconnected.push(deviceId)
  }
}
