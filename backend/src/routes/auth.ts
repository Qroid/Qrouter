import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import auditService from '../services/auditService';

const router = express.Router();
const prisma = new PrismaClient();

// Admin login
router.post('/admin/login', [
  body('username').optional().isString().trim().notEmpty(),
  body('email').optional().isEmail(),
  body().custom(value => {
    if (!value.username && !value.email) throw new Error('Username or email required');
    return true;
  }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: username ? { username } : { email }
    });

    if (!user || !user.isActive || !user.password || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      await auditService.record({
        organizationId: user?.organizationId ?? '',
        userId: user?.id ?? null,
        action: 'auth.login_failed',
        entity: 'User',
        entityId: user?.id ?? null,
        details: { email, reason: 'unknown_or_unprivileged_user' },
        ipAddress: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string) ?? null
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const organizationId = (req as AuthRequest).organizationId;
    if (organizationId && user.organizationId !== organizationId) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await auditService.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.login_failed',
        entity: 'User',
        entityId: user.id,
        details: { email, reason: 'bad_password' },
        ipAddress: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string) ?? null
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }
    const token = jwt.sign(
      { userId: user.id },
      jwtSecret,
      { expiresIn: '7d' } as jwt.SignOptions
    );

    await auditService.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] as string) ?? null
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
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
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true,
        createdAt: true
      }
    });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get user info' });
  }
});

// Update profile
router.put('/profile', authenticateToken, [
  body('firstName').optional().isLength({ min: 2 }),
  body('lastName').optional().isLength({ min: 2 }),
  body('email').optional().isEmail()
], async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { firstName, lastName, email } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        firstName,
        lastName,
        email
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        organizationId: true
      }
    });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

export default router;