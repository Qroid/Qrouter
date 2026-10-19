import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import mpesaService from '../services/mpesaService';
import sessionService from '../services/sessionService';
import smsService from '../services/smsService';
import { AuthRequest, scopeToOrganization } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all active plans (public) - scoped to organization
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const plans = await prisma.plan.findMany({
      where: {
        organizationId: orgId,
        isActive: true
      },
      orderBy: { price: 'asc' }
    });

    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// Get plan by ID
router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;

    const plan = await prisma.plan.findFirst({
      where: { id, organizationId: orgId, isActive: true }
    });

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch plan' });
  }
});

// Register new user
router.post('/register', [
  body('phone').isMobilePhone('any').withMessage('Valid phone number required'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('firstName').optional().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').optional().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { phone, email, firstName, lastName } = req.body;

    // Check if user already exists within organization
    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { phone },
          ...(email ? [{ email }] : [])
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this phone number or email already exists'
      });
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        phone,
        email,
        firstName,
        lastName,
        role: 'CUSTOMER',
        organizationId: orgId
      }
    });

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }
    const token = jwt.sign(
      { userId: user.id },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    // Send welcome SMS
    await smsService.sendWelcomeMessage(phone, firstName);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organizationId: user.organizationId
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Login user
router.post('/login', [
  body('phone').isMobilePhone('any').withMessage('Valid phone number required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { phone } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        organizationId: orgId,
        phone
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'User not found or inactive' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }
    const token = jwt.sign(
      { userId: user.id },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          organizationId: user.organizationId
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Initiate payment
router.post('/payment', [
  body('phone').isMobilePhone('any').withMessage('Valid phone number required'),
  body('planId').isUUID().withMessage('Valid plan ID required'),
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { phone, planId, amount } = req.body;

    // Get or create user within organization
    let user = await prisma.user.findFirst({
      where: { phone, organizationId: orgId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          role: 'CUSTOMER',
          organizationId: orgId
        }
      });
    } else if (user.organizationId !== orgId) {
      return res.status(403).json({ success: false, error: 'User does not belong to this organization' });
    }

    // Verify plan exists and belongs to organization
    const plan = await prisma.plan.findFirst({
      where: { id: planId, organizationId: orgId }
    });

    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        planId,
        amount,
        status: 'PENDING',
        organizationId: orgId,
        phone
      }
    });

    // Initiate M-Pesa STK Push
    const stkResponse = await mpesaService.initiateSTKPush({
      phone,
      amount,
      accountReference: `QROUTER-${payment.id}`,
      transactionDesc: `Payment for ${plan.name}`
    });

    // Update payment with checkout request ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        checkoutRequestId: stkResponse.CheckoutRequestID
      }
    });

    res.json({
      success: true,
      data: {
        checkoutRequestId: stkResponse.CheckoutRequestID,
        customerMessage: stkResponse.CustomerMessage
      }
    });
  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ success: false, error: 'Payment initiation failed' });
  }
});

// Check payment status
router.get('/payment/status/:checkoutRequestId', async (req: Request, res: Response) => {
  try {
    const { checkoutRequestId } = req.params;
    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const payment = await prisma.payment.findUnique({
      where: { checkoutRequestId },
      include: { user: true, plan: true }
    });

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.organizationId !== orgId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // If payment is completed, create session
    if (payment.status === 'COMPLETED') {
      const existingSession = await prisma.session.findFirst({
        where: {
          userId: payment.userId,
          planId: payment.planId,
          status: 'ACTIVE',
          organizationId: orgId
        }
      });

      if (!existingSession && payment.planId) {
        const sessionToken = generateSessionToken();
        const endTime = new Date();
        const plan = await prisma.plan.findUnique({ where: { id: payment.planId } });
        if (plan) {
          endTime.setHours(endTime.getHours() + plan.duration);
        }

        await prisma.session.create({
          data: {
            userId: payment.userId,
            planId: payment.planId,
            sessionToken,
            endTime,
            status: 'ACTIVE',
            organizationId: orgId
          }
        });

        return res.json({
          success: true,
          data: {
            status: 'completed',
            sessionToken
          }
        });
      }
    }

    res.json({
      success: true,
      data: {
        status: payment.status.toLowerCase(),
        amount: payment.amount
      }
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check payment status' });
  }
});

// Connect to internet
router.post('/connect', [
  body('sessionToken').notEmpty().withMessage('Session token required')
], async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.body;
    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true, plan: true }
    });

    if (!session || session.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    if (session.organizationId !== orgId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if session has expired
    if (session.endTime && new Date() > session.endTime) {
      await prisma.session.update({
        where: { id: session.id },
        data: { status: 'EXPIRED', endTime: new Date() }
      });
      return res.status(401).json({ success: false, error: 'Session has expired' });
    }

    res.json({
      success: true,
      data: {
        message: 'Connected successfully',
        session: {
          id: session.id,
          plan: session.plan.name,
          endTime: session.endTime
        }
      }
    });
  } catch (error) {
    console.error('Connection error:', error);
    res.status(500).json({ success: false, error: 'Connection failed' });
  }
});

// M-Pesa callback
router.post('/payment/mpesa/callback', async (req: Request, res: Response) => {
  try {
    await mpesaService.handleCallback(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ success: false });
  }
});

// Helper function
function generateSessionToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export default router;