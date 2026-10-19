import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * RADIUS accounting ingestion.
 *
 * A RADIUS server (FreeRADIUS and friends) posts Start / Interim-Update / Stop
 * packets here. Requests are authenticated with the shared secret when
 * RADIUS_SECRET is configured; the tenant is derived from the NAS IP so a
 * single RADIUS server can serve every organization.
 */
router.post('/accounting', async (req: Request, res: Response) => {
  try {
    const configuredSecret = process.env.RADIUS_SECRET;
    if (configuredSecret) {
      const presented = (req.headers['x-radius-secret'] as string) ?? '';
      if (presented !== configuredSecret) {
        return res.status(401).json({ success: false, error: 'Invalid RADIUS shared secret' });
      }
    }

    const {
      sessionId,
      username,
      statusType,
      nasIpAddress,
      framedIpAddress,
      callingStationId,
      acctInputOctets,
      acctOutputOctets,
      acctSessionTime,
      organizationId: orgFromBody
    } = req.body ?? {};

    if (!sessionId || !username) {
      return res.status(400).json({ success: false, error: 'sessionId and username are required' });
    }

    // Resolve the tenant from the NAS, falling back to the request context.
    let organizationId: string | undefined = orgFromBody;

    if (!organizationId && nasIpAddress) {
      const nas = await prisma.radiusNas.findFirst({
        where: { ipAddress: nasIpAddress, isActive: true },
        select: { organizationId: true }
      });

      if (!nas) {
        const device = await prisma.nasDevice.findFirst({
          where: { host: nasIpAddress, isActive: true },
          select: { organizationId: true }
        });
        organizationId = device?.organizationId;
      } else {
        organizationId = nas.organizationId;
      }
    }

    if (!organizationId) {
      organizationId = (req as AuthRequest).organizationId;
    }

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Unable to resolve organization for this NAS' });
    }

    const bytesIn = BigInt(acctInputOctets ?? 0);
    const bytesOut = BigInt(acctOutputOctets ?? 0);
    const stopped = String(statusType).toLowerCase() === 'stop';

    const existing = await prisma.radiusAccounting.findFirst({
      where: { sessionId, organizationId }
    });

    const data = {
      organizationId,
      sessionId,
      username,
      nasIpAddress: nasIpAddress ?? null,
      framedIpAddress: framedIpAddress ?? null,
      callingStationId: callingStationId ?? null,
      acctInputOctets: bytesIn,
      acctOutputOctets: bytesOut,
      acctSessionTime: Number(acctSessionTime ?? 0),
      acctStopTime: stopped ? new Date() : null
    };

    const accounting = existing
      ? await prisma.radiusAccounting.update({ where: { id: existing.id }, data })
      : await prisma.radiusAccounting.create({ data });

    // Mirror usage back onto the Qrouter session when the RADIUS session id
    // is the session token we issued.
    const session = await prisma.session.findFirst({
      where: { sessionToken: sessionId, organizationId }
    });

    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          dataUsed: bytesIn + bytesOut,
          nasDeviceId: session.nasDeviceId,
          ...(stopped ? { status: 'EXPIRED', endTime: new Date() } : {})
        }
      });
    }

    res.json({ success: true, data: { id: accounting.id, statusType } });
  } catch (error) {
    console.error('RADIUS accounting error:', error);
    res.status(500).json({ success: false, error: 'Failed to record accounting data' });
  }
});

// GET /api/radius/sessions — recent accounting records (staff view)
router.get('/sessions', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN', 'TECHNICIAN']), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const limit = Number(req.query.limit ?? 50);

    const sessions = await prisma.radiusAccounting.findMany({
      where: { organizationId: orgId },
      orderBy: { acctStartTime: 'desc' },
      take: Math.min(limit, 200)
    });

    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load accounting records' });
  }
});

export default router;
