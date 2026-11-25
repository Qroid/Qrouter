import express, { Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import auditService from '../services/auditService';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

// Roles allowed to manage vouchers. AGENT (reseller / field agent) is
// intentionally included — agents sell voucher batches in the field.
const STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'TECHNICIAN', 'SUPPORT', 'AGENT'];
const isStaff = (req: AuthRequest): boolean => STAFF_ROLES.includes(req.user?.role ?? '');

const paginate = (req: AuthRequest) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit)
});

/**
 * Voucher codes use an unambiguous alphabet (no 0/O/1/I) so customers can
 * type them from a printed card without mistakes.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_BLOCKS = 3;
const CODE_BLOCK_SIZE = 4;

const randomBlock = (): string => {
  let out = '';
  const bytes = crypto.randomBytes(CODE_BLOCK_SIZE);
  for (let i = 0; i < CODE_BLOCK_SIZE; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
};

const generateCode = (prefix?: string): string => {
  const blocks = Array.from({ length: CODE_BLOCKS }, randomBlock);
  const core = blocks.join('-');
  return prefix ? `${prefix}-${core}` : core;
};

const normalizeCode = (raw: string): string =>
  raw.trim().toUpperCase().replace(/\s+/g, '');

// ─────────────────────── Stats ───────────────────────

// GET /api/vouchers/stats — counts for the dashboard header cards
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const now = new Date();
    const [total, unused, redeemed, expired] = await Promise.all([
      prisma.voucher.count({ where: { organizationId: orgId } }),
      prisma.voucher.count({
        where: { organizationId: orgId, isRedeemed: false, expiresAt: { gt: now } }
      }),
      prisma.voucher.count({ where: { organizationId: orgId, isRedeemed: true } }),
      prisma.voucher.count({
        where: { organizationId: orgId, isRedeemed: false, expiresAt: { lte: now } }
      })
    ]);

    res.json({ success: true, data: { total, unused, redeemed, expired } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load voucher stats' });
  }
});

// ─────────────────────── List ───────────────────────

// GET /api/vouchers — paginated list with status/plan/search filters
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { page, limit, skip } = paginate(req);
    const now = new Date();
    const { status, planId, search, batchId } = req.query;

    const where: Prisma.VoucherWhereInput = { organizationId: orgId };

    if (planId) where.planId = String(planId);
    if (batchId) where.batchId = String(batchId);

    if (status === 'unused') {
      where.isRedeemed = false;
      where.expiresAt = { gt: now };
    } else if (status === 'redeemed') {
      where.isRedeemed = true;
    } else if (status === 'expired') {
      where.isRedeemed = false;
      where.expiresAt = { lte: now };
    }

    if (search) {
      where.code = { contains: normalizeCode(String(search)) };
    }

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: { plan: { select: { id: true, name: true, duration: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.voucher.count({ where })
    ]);

    res.json({ success: true, data: { vouchers, pagination: buildPagination(page, limit, total) } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load vouchers' });
  }
});

// ─────────────────────── Generate ───────────────────────

// POST /api/vouchers — generate a batch of plan-bound voucher codes
router.post(
  '/',
  [
    body('planId').isUUID().withMessage('Valid plan ID required'),
    body('quantity').isInt({ min: 1, max: 500 }).withMessage('Quantity must be 1-500'),
    body('expiresInDays').optional().isInt({ min: 1, max: 3650 }),
    body('prefix').optional().isString().trim().isLength({ max: 8 }).matches(/^[A-Za-z0-9]*$/)
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      if (!isStaff(req)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(400).json({ success: false, error: 'Organization context required' });
      }

      const { planId, quantity, expiresInDays, prefix } = req.body;

      const plan = await prisma.plan.findFirst({
        where: { id: planId, organizationId: orgId, isActive: true }
      });
      if (!plan) {
        return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiresInDays ?? 30));

      const batchId = crypto.randomUUID();
      const upperPrefix = prefix ? String(prefix).toUpperCase() : undefined;

      // Generate unique codes: retry on the (astronomically unlikely)
      // collision with codes already stored for this organization.
      let created: { id: string }[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const codes = new Set<string>();
        while (codes.size < quantity) {
          codes.add(generateCode(upperPrefix));
        }

        const existing = await prisma.voucher.findMany({
          where: { organizationId: orgId, code: { in: [...codes] } },
          select: { code: true }
        });
        const taken = new Set(existing.map(v => v.code));
        const fresh = [...codes].filter(c => !taken.has(c));
        if (fresh.length === 0) continue;

        await prisma.voucher.createMany({
          data: fresh.map(code => ({
            organizationId: orgId,
            code,
            batchId,
            planId,
            amount: plan.price,
            expiresAt
          }))
        });

        created = await prisma.voucher.findMany({
          where: { batchId },
          select: { id: true }
        });
        if (created.length >= quantity) break;
      }

      await auditService.recordFromRequest(req, 'voucher.generate', 'Voucher', batchId, {
        planId,
        planName: plan.name,
        quantity,
        expiresAt: expiresAt.toISOString()
      });

      res.status(201).json({
        success: true,
        data: { batchId, quantity: created.length, expiresAt }
      });
    } catch (error) {
      console.error('Voucher generation error:', error);
      res.status(500).json({ success: false, error: 'Failed to generate vouchers' });
    }
  }
);

// ─────────────────────── Delete ───────────────────────

// DELETE /api/vouchers/:id — void a single unredeemed voucher
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!isStaff(req)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const voucher = await prisma.voucher.findFirst({
      where: { id: req.params.id, organizationId: orgId }
    });
    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    if (voucher.isRedeemed) {
      return res.status(409).json({ success: false, error: 'Cannot delete a redeemed voucher' });
    }

    await prisma.voucher.delete({ where: { id: voucher.id } });

    await auditService.recordFromRequest(req, 'voucher.delete', 'Voucher', voucher.id, {
      code: voucher.code
    });

    res.json({ success: true, data: { message: 'Voucher deleted' } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete voucher' });
  }
});

export default router;
