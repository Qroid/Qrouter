/**
 * Vendor-neutral NAS (Network Access Server) contract.
 *
 * Qrouter talks to routers through this interface, never directly to a vendor
 * SDK. Each supported platform provides an adapter; unsupported platforms
 * return a clear error instead of silently doing nothing.
 */

export type NasTypeValue = 'MIKROTIK' | 'UBIQUITI' | 'CISCO' | 'RADIUS' | 'OTHER';

export interface NasDeviceConfig {
  id: string;
  organizationId: string;
  name: string;
  type: NasTypeValue;
  host: string;
  apiPort: number;
  username?: string | null;
  password?: string | null;
  secret?: string | null;
}

export interface NasActiveSession {
  sessionId: string;
  username?: string;
  ipAddress?: string;
  macAddress?: string;
  bytesIn: number;
  bytesOut: number;
  uptime?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface NasAccessRequest {
  /** Qrouter session token, used as the router username. */
  username: string;
  password?: string;
  /** Bandwidth profile name on the device. */
  profile?: string;
  /** Rate limit in <up>/<down> form, e.g. "10M/10M". */
  rateLimit?: string;
  /** Session lifetime on the device, e.g. "3600s". */
  sessionTimeout?: string;
}

export interface NasUsage {
  bytesIn: number;
  bytesOut: number;
  uptime?: string;
}

export interface NasAdapter {
  readonly type: NasTypeValue;
  testConnection(): Promise<boolean>;
  createAccess(request: NasAccessRequest): Promise<void>;
  removeAccess(username: string): Promise<void>;
  /** Change of Authorization: kick an active session off the network. */
  disconnectSession(sessionId: string): Promise<void>;
  listActiveSessions(): Promise<NasActiveSession[]>;
  getUsage(username: string): Promise<NasUsage | null>;
}

export class NasError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NasError';
  }
}

export class UnsupportedNasError extends NasError {
  constructor(type: NasTypeValue) {
    super(`No adapter is implemented for NAS type ${type}`);
    this.name = 'UnsupportedNasError';
  }
}
