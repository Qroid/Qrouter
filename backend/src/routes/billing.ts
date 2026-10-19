import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import billingService from '../services/billingService';
import auditService from '../services/auditService';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

const STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'TECHNICIAN', 'SUPPORT', 'AGENT'];
const isStaff = (req: AuthRequest): boolean =>
  STAFF_ROLES.includes(req.user?.role ?? '');

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

// ─────────────────────── Customer-facing ───────────────────────

// GET /api/billing/my/wallet — the caller's own wallet
router.get('/my/wallet', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const wallet = await billingService.getWallet(req.user!.id, orgId);

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json({ success: true, data: { wallet, transactions } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load wallet' });
  }
});

// GET /api/billing/my/invoices — the caller's own invoices
router.get('/my/invoices', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { page, limit, skip } = paginate(req);
    const { status } = req.query;

    const where: any = { organizationId: orgId, userId: req.user!.id };
    if (status) where.status = status as string;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true }
      }),
      prisma.invoice.count({ where })
    ]);

    res.json({
      success: true,
      data: { invoices, pagination: buildPagination(page, limit, total) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load invoices' });
  }
});

// POST /api/billing/invoices/:id/pay — settle an invoice
router.post('/invoices/:id/pay', [
  body('method')
    .optional()
    .isIn(['WALLET', 'MPESA', 'CASH', 'CARD', 'BANK_TRANSFER'])
    .withMessage('Unsupported payment method'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valid amount required'),
  body('reference').optional().isString()
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

    const { id } = req.params;
    const { method = 'WALLET', amount, reference } = req.body;

    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId: orgId }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const isOwner = invoice.userId === req.user!.id;
    if (!isOwner && !isStaff(req)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Customers settle from their wallet; recording cash/card is a staff action.
    if (!isStaff(req) && method !== 'WALLET') {
      return res.status(403).json({ success: false, error: 'Customers can only pay with wallet balance' });
    }

    const updated = await billingService.payInvoice(id, orgId, { method, amount, reference });

    await auditService.recordFromRequest(req, 'invoice.pay', 'Invoice', id, {
      invoiceNumber: invoice.number,
      method,
      amount: amount ?? null
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to pay invoice';
    res.status(400).json({ success: false, error: message });
  }
});

// ───────────────────────── Admin-only ─────────────────────────

router.use(requireRole(['ADMIN', 'SUPER_ADMIN']));

// GET /api/billing/invoices — every invoice in the organization
router.get('/invoices', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { page, limit, skip } = paginate(req);
    const { status } = req.query;

    const where: any = { organizationId: orgId };
    if (status) where.status = status as string;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          user: { select: { id: true, phone: true, firstName: true, lastName: true } }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    res.json({
      success: true,
      data: { invoices, pagination: buildPagination(page, limit, total) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load invoices' });
  }
});

// GET /api/billing/subscriptions
router.get('/subscriptions', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { page, limit, skip } = paginate(req);
    const { status } = req.query;

    const where: any = { organizationId: orgId };
    if (status) where.status = status as string;

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: { select: { id: true, name: true, price: true } },
          user: { select: { id: true, phone: true, firstName: true, lastName: true } }
        }
      }),
      prisma.subscription.count({ where })
    ]);

    res.json({
      success: true,
      data: { subscriptions, pagination: buildPagination(page, limit, total) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load subscriptions' });
  }
});

// POST /api/billing/subscriptions — start a recurring subscription
router.post('/subscriptions', [
  body('userId').isUUID().withMessage('Valid user ID required'),
  body('planId').isUUID().withMessage('Valid plan ID required'),
  body('billingCycle').optional().isIn(['MONTHLY', 'QUARTERLY', 'YEARLY'])
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

    const { userId, planId, billingCycle } = req.body;

    // Both the customer and the plan must belong to this organization.
    const customer = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const result = await billingService.createSubscription({
      organizationId: orgId,
      userId,
      planId,
      billingCycle
    });

    await auditService.recordFromRequest(req, 'subscription.create', 'Subscription', result.subscription.id, {
      userId,
      planId,
      billingCycle: result.subscription.billingCycle
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create subscription';
    res.status(400).json({ success: false, error: message });
  }
});

// POST /api/billing/subscriptions/:id/cancel
router.post('/subscriptions/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;
    const immediate = req.body?.immediate === true;

    const subscription = await billingService.cancelSubscription(id, orgId, immediate);

    await auditService.recordFromRequest(req, 'subscription.cancel', 'Subscription', id, { immediate });

    res.json({ success: true, data: subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription';
    res.status(400).json({ success: false, error: message });
  }
});

// POST /api/billing/wallets/topup — credit a customer wallet
router.post('/wallets/topup', [
  body('userId').isUUID().withMessage('Valid user ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount required'),
  body('description').optional().isString()
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

    const { userId, amount, description } = req.body;

    const customer = await prisma.user.findFirst({
      where: { id: userId, organizationId: orgId }
    });

    if (!customer) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const transaction = await billingService.creditWallet({
      organizationId: orgId,
      userId,
      amount,
      description: description ?? 'Manual top-up by admin'
    });

    await auditService.recordFromRequest(req, 'wallet.topup', 'Wallet', transaction.walletId, {
      userId,
      amount
    });

    res.json({ success: true, data: transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to top up wallet';
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
