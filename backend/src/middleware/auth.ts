import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    phone: string;
    role: string;
    organizationId: string;
  };
  organizationId?: string;
}

/**
 * Resolve tenant organization from request.
 * Supports: X-Organization-ID header, X-Tenant header, or subdomain.
 * Falls back to a default organization for backward compatibility.
 */
export const resolveTenant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // 1. Check X-Organization-ID header
    let orgId = req.headers['x-organization-id'] as string ||
                req.headers['x-tenant'] as string;

    // 2. Check subdomain (e.g., qrouter.example.com)
    if (!orgId) {
      const host = req.headers.host || '';
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'localhost') {
        const org = await prisma.organization.findUnique({
          where: { slug: subdomain },
          select: { id: true }
        });
        if (org) {
          orgId = org.id;
        }
      }
    }

    // 3. Fallback: find first active organization (dev mode only)
    if (!orgId) {
      if (process.env.NODE_ENV === 'development') {
        const defaultOrg = await prisma.organization.findFirst({
          where: { isActive: true },
          select: { id: true }
        });
        if (defaultOrg) {
          orgId = defaultOrg.id;
        }
      } else {
        return res.status(400).json({ error: 'Organization not specified. Use X-Organization-ID header.' });
      }
    }

    req.organizationId = orgId;
    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    return res.status(500).json({ error: 'Failed to resolve organization' });
  }
};

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET not configured' });
    }
    const decoded = jwt.verify(token, jwtSecret) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, phone: true, role: true, isActive: true, organizationId: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Ensure user belongs to the resolved organization
    if (req.organizationId && req.organizationId !== user.organizationId) {
      return res.status(403).json({ error: 'User does not belong to this organization' });
    }

    // Use user's organization if none resolved yet
    if (!req.organizationId) {
      req.organizationId = user.organizationId;
    }

    req.user = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      organizationId: user.organizationId
    };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Scope all subsequent Prisma queries to the current organization.
 * Use this in route handlers before querying data.
 */
export const scopeToOrganization = (req: AuthRequest) => {
  return {
    organizationId: req.organizationId || req.user?.organizationId
  };
};