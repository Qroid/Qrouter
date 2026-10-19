import { RouterOSAPI } from 'node-routeros';
import {
  NasAccessRequest,
  NasActiveSession,
  NasAdapter,
  NasDeviceConfig,
  NasError,
  NasUsage,
  NasTypeValue
} from './types';

/**
 * MikroTik adapter over the RouterOS API (node-routeros).
 *
 * Every call opens a short-lived connection: RouterOS API sockets are not safe
 * to share across concurrent requests, and Qrouter calls them infrequently.
 */
export class MikrotikAdapter implements NasAdapter {
  readonly type: NasTypeValue = 'MIKROTIK';

  constructor(private readonly device: NasDeviceConfig) {}

  private open(): RouterOSAPI {
    return new RouterOSAPI({
      host: this.device.host,
      user: this.device.username ?? 'admin',
      password: this.device.password ?? '',
      port: this.device.apiPort || 8728,
      timeout: 10
    });
  }

  private async withApi<T>(operation: (api: RouterOSAPI) => Promise<T>): Promise<T> {
    const api = this.open();
    try {
      await api.connect();
      return await operation(api);
    } catch (error) {
      throw new NasError(`MikroTik ${this.device.host} call failed`, error);
    } finally {
      try {
        await api.close();
      } catch {
        // closing an already-closed socket is not an error worth surfacing
      }
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.withApi(async (api) => {
        await api.write('/system/identity/print');
      });
      return true;
    } catch {
      return false;
    }
  }

  async createAccess(request: NasAccessRequest): Promise<void> {
    const profile = request.profile ?? 'default';

    // Profiles are idempotent: re-creating an existing profile on RouterOS
    // throws, and Qrouter creates access on every payment.
    try {
      await this.withApi(async (api) => {
        await api.write('/ip/hotspot/user/profile/add', [
          `=name=${profile}`,
          `=rate-limit=${request.rateLimit ?? '10M/10M'}`,
          `=session-timeout=${request.sessionTimeout ?? '3600s'}`,
          '=shared-users=1',
          '=status-autorefresh=1m'
        ]);
      });
    } catch (error) {
      console.log(`Profile ${profile} may already exist, continuing…`);
    }

    await this.withApi(async (api) => {
      await api.write('/ip/hotspot/user/add', [
        `=name=${request.username}`,
        `=password=${request.password ?? request.username}`,
        `=profile=${profile}`,
        '=disabled=no'
      ]);
    });
  }

  async removeAccess(username: string): Promise<void> {
    await this.withApi(async (api) => {
      const users = await api.write('/ip/hotspot/user/print', [`?name=${username}`]);
      if (users.length > 0) {
        await api.write('/ip/hotspot/user/remove', [`=.id=${users[0]['.id']}`]);
      }
    });
  }

  async disconnectSession(sessionId: string): Promise<void> {
    await this.withApi(async (api) => {
      await api.write('/ip/hotspot/active/remove', [`=.id=${sessionId}`]);
    });
  }

  async listActiveSessions(): Promise<NasActiveSession[]> {
    try {
      const rows = await this.withApi((api) => api.write('/ip/hotspot/active/print'));

      return rows.map((row: any) => ({
        sessionId: row['.id'],
        username: row.user ?? undefined,
        ipAddress: row.address ?? undefined,
        macAddress: row['mac-address'] ?? undefined,
        bytesIn: parseInt(row['bytes-in'] ?? '0', 10),
        bytesOut: parseInt(row['bytes-out'] ?? '0', 10),
        uptime: row.uptime ?? undefined,
        deviceId: this.device.id,
        deviceName: this.device.name
      }));
    } catch (error) {
      console.error(`Failed to list active sessions on ${this.device.name}:`, error);
      return [];
    }
  }

  async getUsage(username: string): Promise<NasUsage | null> {
    try {
      const rows = await this.withApi((api) =>
        api.write('/ip/hotspot/active/print', [`?user=${username}`])
      );

      if (rows.length === 0) {
        return null;
      }

      return {
        bytesIn: parseInt(rows[0]['bytes-in'] ?? '0', 10),
        bytesOut: parseInt(rows[0]['bytes-out'] ?? '0', 10),
        uptime: rows[0].uptime ?? undefined
      };
    } catch {
      return null;
    }
  }
}
