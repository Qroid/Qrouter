import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all active plans (public)
router.get('/', async (req, res) => {
  try {
    const orgId = (req as AuthRequest).organizationId;
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const plans = await prisma.plan.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { price: 'asc' }
    });
    
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// Get plan by ID
router.get('/:id', async (req, res) => {
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

export default router;