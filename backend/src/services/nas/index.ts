import { PrismaClient } from '@prisma/client';
import { MikrotikAdapter } from './mikrotikAdapter';
import {
  NasAccessRequest,
  NasActiveSession,
  NasAdapter,
  NasDeviceConfig,
  NasTypeValue,
  UnsupportedNasError
} from './types';

const prisma = new PrismaClient();

/**
 * Resolves device records into adapters and drives them.
 *
 * Devices normally come from the `NasDevice` table (per organization). When an
 * organization has no device records yet, Qrouter falls back to the legacy
 * MIKROTIK_* environment variables so existing installs keep working.
 */
export class NasService {
  async getAdapter(device: NasDeviceConfig): Promise<NasAdapter> {
    switch (device.type) {
      case 'MIKROTIK':
        return new MikrotikAdapter(device);
      case 'UBIQUITI':
      case 'CISCO':
      case 'RADIUS':
      case 'OTHER':
        throw new UnsupportedNasError(device.type);
      default:
        throw new UnsupportedNasError((device.type ?? 'OTHER') as NasTypeValue);
    }
  }

  /** The organization's first active device, or the env-configured router. */
  async resolveDevice(organizationId: string, deviceId?: string): Promise<NasDeviceConfig | null> {
    if (deviceId) {
      const device = await prisma.nasDevice.findFirst({
        where: { id: deviceId, organizationId }
      });
      return device ? this.toConfig(device) : null;
    }

    const device = await prisma.nasDevice.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'asc' }
    });

    if (device) {
      return this.toConfig(device);
    }

    if (!process.env.MIKROTIK_HOST) {
      return null;
    }

    return {
      id: 'env-default',
      organizationId,
      name: process.env.MIKROTIK_NAME ?? 'Default router',
      type: 'MIKROTIK',
      host: process.env.MIKROTIK_HOST,
      apiPort: parseInt(process.env.MIKROTIK_PORT ?? '8728', 10),
      username: process.env.MIKROTIK_USERNAME ?? 'admin',
      password: process.env.MIKROTIK_PASSWORD ?? ''
    };
  }

  private toConfig(device: {
    id: string;
    organizationId: string;
    name: string;
    type: NasTypeValue;
    host: string;
    apiPort: number;
    username?: string | null;
    password?: string | null;
    secret?: string | null;
  }): NasDeviceConfig {
    return {
      id: device.id,
      organizationId: device.organizationId,
      name: device.name,
      type: device.type,
      host: device.host,
      apiPort: device.apiPort,
      username: device.username,
      password: device.password,
      secret: device.secret
    };
  }

  // ───────────────────────── Operations ─────────────────────────

  /** Grant network access for a purchased session. */
  async grantAccess(organizationId: string, request: NasAccessRequest, deviceId?: string): Promise<boolean> {
    const device = await this.resolveDevice(organizationId, deviceId);
    if (!device) {
      console.warn(`No NAS device configured for organization ${organizationId}`);
      return false;
    }

    try {
      const adapter = await this.getAdapter(device);
      await adapter.createAccess(request);
      return true;
    } catch (error) {
      console.error(`Failed to grant access on ${device.name}:`, error);
      return false;
    }
  }

  /** Remove the device-side credentials for a session. */
  async revokeAccess(organizationId: string, username: string, deviceId?: string): Promise<boolean> {
    const device = await this.resolveDevice(organizationId, deviceId);
    if (!device) {
      return false;
    }

    try {
      const adapter = await this.getAdapter(device);
      await adapter.removeAccess(username);
      return true;
    } catch (error) {
      console.error(`Failed to revoke access on ${device.name}:`, error);
      return false;
    }
  }

  /** CoA: disconnect a live session on the device. */
  async disconnect(organizationId: string, sessionId: string, deviceId?: string): Promise<boolean> {
    const device = await this.resolveDevice(organizationId, deviceId);
    if (!device) {
      return false;
    }

    try {
      const adapter = await this.getAdapter(device);
      await adapter.disconnectSession(sessionId);
      return true;
    } catch (error) {
      console.error(`Failed to disconnect ${sessionId} on ${device.name}:`, error);
      return false;
    }
  }

  /** Active sessions across every configured device of an organization. */
  async listActiveSessions(organizationId: string, deviceId?: string): Promise<NasActiveSession[]> {
    if (deviceId) {
      const device = await this.resolveDevice(organizationId, deviceId);
      if (!device) return [];
      try {
        const adapter = await this.getAdapter(device);
        return await adapter.listActiveSessions();
      } catch (error) {
        console.error(`Failed to list sessions on ${device.name}:`, error);
        return [];
      }
    }

    const devices = await prisma.nasDevice.findMany({
      where: { organizationId, isActive: true }
    });

    const targets = devices.length
      ? devices.map((d) => this.toConfig(d))
      : [await this.resolveDevice(organizationId)].filter((d): d is NasDeviceConfig => d !== null);

    const results = await Promise.all(
      targets.map(async (device) => {
        try {
          const adapter = await this.getAdapter(device);
          return await adapter.listActiveSessions();
        } catch (error) {
          console.error(`Failed to list sessions on ${device.name}:`, error);
          return [] as NasActiveSession[];
        }
      })
    );

    return results.flat();
  }

  /**
   * Health sweep for the monitoring cron: mark devices seen, and raise a
   * NetworkAlert for devices that stop answering.
   */
  async healthCheck(): Promise<{ checked: number; reachable: number; unreachable: number }> {
    const devices = await prisma.nasDevice.findMany({ where: { isActive: true } });
    let reachable = 0;
    let unreachable = 0;

    for (const device of devices) {
      const config = this.toConfig(device);
      let ok = false;

      try {
        const adapter = await this.getAdapter(config);
        ok = await adapter.testConnection();
      } catch (error) {
        ok = false;
      }

      if (ok) {
        reachable += 1;
        await prisma.nasDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() }
        });

        // Auto-resolve any open alert for this device.
        await prisma.networkAlert.updateMany({
          where: { nasDeviceId: device.id, isResolved: false },
          data: { isResolved: true, resolvedAt: new Date() }
        });
      } else {
        unreachable += 1;

        const existing = await prisma.networkAlert.findFirst({
          where: { nasDeviceId: device.id, isResolved: false }
        });

        if (!existing) {
          await prisma.networkAlert.create({
            data: {
              organizationId: device.organizationId,
              nasDeviceId: device.id,
              title: `${device.name} is unreachable`,
              message: `No response from ${device.host}:${device.apiPort}`,
              severity: 'CRITICAL'
            }
          });
        }
      }
    }

    return { checked: devices.length, reachable, unreachable };
  }
}

export * from './types';
export default new NasService();
