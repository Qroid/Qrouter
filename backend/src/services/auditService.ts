import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export interface AuditEntry {
  organizationId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Audit trail for administrative actions.
 *
 * Writes are best-effort on purpose: an auditing failure must never break the
 * request that triggered it.
 */
export class AuditService {
  async record(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          details: entry.details ?? undefined,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null
        }
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  /** Build an entry from the current request context. */
  fromRequest(
    req: AuthRequest,
    action: string,
    entity: string,
    entityId?: string | null,
    details?: Record<string, unknown> | null
  ): AuditEntry | null {
    const organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId) {
      return null;
    }

    return {
      organizationId,
      userId: req.user?.id ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details: details ?? null,
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null
    };
  }

  /** Convenience wrapper: no-op when the tenant could not be resolved. */
  async recordFromRequest(
    req: AuthRequest,
    action: string,
    entity: string,
    entityId?: string | null,
    details?: Record<string, unknown> | null
  ): Promise<void> {
    const entry = this.fromRequest(req, action, entity, entityId, details);
    if (entry) {
      await this.record(entry);
    }
  }
}

export default new AuditService();
