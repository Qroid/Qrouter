import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole, AuthRequest, scopeToOrganization } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import sessionService from '../services/sessionService';
import nasService from '../services/nas';
import auditService from '../services/auditService';

const router = express.Router();
const prisma = new PrismaClient();

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// Dashboard stats
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;

    const [
      totalUsers,
      activeUsers,
      totalRevenue,
      todayRevenue,
      activeSessions,
      totalSessions
    ] = await Promise.all([
      prisma.user.count({ where: { organizationId: orgId, role: 'CUSTOMER' } }),
      prisma.user.count({ where: { organizationId: orgId, role: 'CUSTOMER', isActive: true } }),
      prisma.payment.aggregate({
        where: { organizationId: orgId, status: 'COMPLETED' },
        _sum: { amount: true }
      }),
      prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        },
        _sum: { amount: true }
      }),
      prisma.session.count({ where: { organizationId: orgId, status: 'ACTIVE' } }),
      prisma.session.count({ where: { organizationId: orgId } })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalRevenue: totalRevenue._sum.amount || 0,
        todayRevenue: todayRevenue._sum.amount || 0,
        activeSessions,
        totalSessions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get dashboard stats' });
  }
});

// Get all users (scoped to organization)
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = search
      ? {
          organizationId: orgId,
          OR: [
            { phone: { contains: search as string } },
            { email: { contains: search as string } },
            { firstName: { contains: search as string } },
            { lastName: { contains: search as string } }
          ]
        }
      : { organizationId: orgId };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          sessions: {
            where: { status: 'ACTIVE', organizationId: orgId },
            take: 1
          },
          _count: {
            select: {
              sessions: { where: { organizationId: orgId } },
              payments: { where: { organizationId: orgId } }
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

// Get all plans (scoped to organization)
router.get('/plans', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;

    const plans = await prisma.plan.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            sessions: { where: { organizationId: orgId } },
            payments: { where: { organizationId: orgId } }
          }
        }
      }
    });

    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get plans' });
  }
});

// Create plan
router.post('/plans', [
  body('name').notEmpty().withMessage('Plan name required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
  body('duration').isInt({ min: 1 }).withMessage('Valid duration required'),
  body('dataLimit').notEmpty().withMessage('Data limit required'),
  body('speedLimit').notEmpty().withMessage('Speed limit required')
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = req.organizationId!;
    const {
      name,
      description,
      price,
      duration,
      dataLimit,
      speedLimit,
      isRecurring,
      setupFee,
      taxIncluded
    } = req.body;

    const plan = await prisma.plan.create({
      data: {
        name,
        description,
        price,
        duration,
        dataLimit,
        speedLimit,
        isRecurring: isRecurring ?? false,
        setupFee: setupFee ?? 0,
        taxIncluded: taxIncluded ?? true,
        organizationId: orgId
      }
    });

    await auditService.recordFromRequest(req, 'plan.create', 'Plan', plan.id, {
      name: plan.name,
      price: plan.price,
      duration: plan.duration,
      dataLimit: plan.dataLimit,
      speedLimit: plan.speedLimit
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create plan' });
  }
});

// Update plan
router.put('/plans/:id', [
  body('name').optional().notEmpty(),
  body('price').optional().isFloat({ min: 0 }),
  body('duration').optional().isInt({ min: 1 })
], async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const updates = req.body;

    // Verify plan belongs to organization
    const existing = await prisma.plan.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: updates
    });

    await auditService.recordFromRequest(req, 'plan.update', 'Plan', id, {
      fields: Object.keys(updates)
    });

    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update plan' });
  }
});

// Delete plan
router.delete('/plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;

    const existing = await prisma.plan.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    await prisma.plan.update({
      where: { id },
      data: { isActive: false }
    });

    await auditService.recordFromRequest(req, 'plan.deactivate', 'Plan', id, {
      name: existing.name
    });

    res.json({ success: true, message: 'Plan deactivated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete plan' });
  }
});

// Get all sessions (scoped to organization)
router.get('/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { organizationId: orgId };
    if (status) where.status = status as any;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { startTime: 'desc' },
        include: {
          user: {
            select: {
              phone: true,
              firstName: true,
              lastName: true
            }
          },
          plan: {
            select: {
              name: true,
              price: true
            }
          }
        }
      }),
      prisma.session.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get sessions' });
  }
});

// Terminate session
router.post('/sessions/:id/terminate', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;

    // Verify session belongs to organization
    const session = await prisma.session.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    await sessionService.terminateSession(id);

    await auditService.recordFromRequest(req, 'session.terminate', 'Session', id, {
      userId: (session as { userId?: string }).userId
    });

    res.json({ success: true, message: 'Session terminated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to terminate session' });
  }
});

// Get payments (scoped to organization)
router.get('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { organizationId: orgId };
    if (status) where.status = status as any;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              phone: true,
              firstName: true,
              lastName: true
            }
          },
          plan: {
            select: {
              name: true
            }
          }
        }
      }),
      prisma.payment.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get payments' });
  }
});

// Get router status
router.get('/router/status', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;

    const activeUsers = await nasService.listActiveSessions(orgId);

    res.json({
      success: true,
      data: {
        activeUsers: activeUsers.length,
        users: activeUsers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get router status' });
  }
});

export default router;