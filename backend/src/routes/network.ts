import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import nasService from '../services/nas';
import auditService from '../services/auditService';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN', 'TECHNICIAN']));

const deviceSelect = {
  id: true,
  name: true,
  type: true,
  host: true,
  apiPort: true,
  location: true,
  isActive: true,
  lastSeenAt: true,
  createdAt: true
};

// GET /api/network/overview — devices, live sessions and open alerts
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const [devices, alerts, activeSessions] = await Promise.all([
      prisma.nasDevice.findMany({
        where: { organizationId: orgId },
        select: deviceSelect,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.networkAlert.findMany({
        where: { organizationId: orgId, isResolved: false },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      nasService.listActiveSessions(orgId)
    ]);

    res.json({ success: true, data: { devices, alerts, activeSessions } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load network overview' });
  }
});

// GET /api/network/devices
router.get('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const devices = await prisma.nasDevice.findMany({
      where: { organizationId: orgId },
      select: deviceSelect,
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: devices });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load devices' });
  }
});

// POST /api/network/devices — register a router / NAS
router.post('/devices', [
  body('name').notEmpty().withMessage('Device name required'),
  body('host').notEmpty().withMessage('Host required'),
  body('type').optional().isIn(['MIKROTIK', 'UBIQUITI', 'CISCO', 'RADIUS', 'OTHER']),
  body('apiPort').optional().isInt({ min: 1, max: 65535 }),
  body('username').optional().isString(),
  body('password').optional().isString(),
  body('secret').optional().isString(),
  body('location').optional().isString()
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { name, host, type, apiPort, username, password, secret, location } = req.body;

    const device = await prisma.nasDevice.create({
      data: {
        organizationId: orgId,
        name,
        host,
        type: type ?? 'MIKROTIK',
        apiPort: apiPort ?? 8728,
        username,
        password,
        secret,
        location
      },
      select: deviceSelect
    });

    await auditService.recordFromRequest(req, 'nas.create', 'NasDevice', device.id, { name, host, type: device.type });

    res.status(201).json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create device' });
  }
});

// POST /api/network/devices/:id/test — connectivity check through the adapter
router.post('/devices/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const device = await nasService.resolveDevice(orgId, req.params.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    try {
      const adapter = await nasService.getAdapter(device);
      const reachable = await adapter.testConnection();

      if (reachable) {
        await prisma.nasDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() }
        });
      }

      res.json({ success: true, data: { device: device.name, reachable } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      res.json({ success: true, data: { device: device.name, reachable: false, error: message } });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to test device' });
  }
});

// POST /api/network/sessions/:sessionId/disconnect — Change of Authorization
router.post('/sessions/:sessionId/disconnect', [
  body('dbSessionId').optional().isUUID().withMessage('Valid session ID required')
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { sessionId } = req.params;
    const { dbSessionId } = req.body;

    const disconnected = await nasService.disconnect(orgId, sessionId);

    if (dbSessionId) {
      const session = await prisma.session.findFirst({
        where: { id: dbSessionId, organizationId: orgId }
      });

      if (session) {
        await prisma.session.update({
          where: { id: session.id },
          data: { status: 'TERMINATED', endTime: new Date() }
        });
      }
    }

    await auditService.recordFromRequest(req, 'session.disconnect', 'Session', dbSessionId ?? null, {
      deviceSessionId: sessionId,
      disconnected
    });

    res.json({
      success: true,
      data: { disconnected, message: disconnected ? 'Session disconnected' : 'Device did not acknowledge the disconnect' }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to disconnect session' });
  }
});

export default router;
