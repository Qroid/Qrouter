import { PrismaClient } from '@prisma/client';
import nasService from './nas';
import smsService from './smsService';

const prisma = new PrismaClient();

interface SessionContext {
  organizationId: string;
}

export class SessionService {
  async createSession(
    userId: string,
    planId: string,
    sessionToken: string,
    context: SessionContext
  ): Promise<any> {
    try {
      const { organizationId } = context;

      const plan = await prisma.plan.findFirst({
        where: { id: planId, organizationId }
      });

      if (!plan) {
        throw new Error('Plan not found');
      }

      const endTime = new Date();
      endTime.setHours(endTime.getHours() + plan.duration);

      const session = await prisma.session.create({
        data: {
          userId,
          planId,
          sessionToken,
          endTime,
          status: 'ACTIVE',
          organizationId
        },
        include: {
          user: true,
          plan: true
        }
      });

      // Provision access on the organization's NAS (vendor-neutral)
      const profileName = `plan_${plan.id}`;
      const rateLimit = this.parseSpeedLimit(plan.speedLimit);

      await nasService.grantAccess(organizationId, {
        username: sessionToken,
        password: sessionToken,
        profile: profileName,
        rateLimit,
        sessionTimeout: `${plan.duration * 3600}s`
      });

      return session;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async terminateSession(sessionId: string, organizationId?: string): Promise<void> {
    try {
      const session = await prisma.session.findFirst({
        where: {
          id: sessionId,
          ...(organizationId ? { organizationId } : {})
        },
        include: { user: true }
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Update session status
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'TERMINATED',
          endTime: new Date()
        }
      });

      // Revoke access on the NAS
      await nasService.revokeAccess(session.organizationId, session.sessionToken);

      console.log(`✅ Session terminated: ${sessionId}`);
    } catch (error) {
      console.error('Error terminating session:', error);
      throw error;
    }
  }

  async getActiveSession(sessionToken: string, organizationId?: string): Promise<any> {
    try {
      const session = await prisma.session.findFirst({
        where: {
          sessionToken,
          ...(organizationId ? { organizationId } : {})
        },
        include: {
          user: true,
          plan: true
        }
      });

      if (!session || session.status !== 'ACTIVE') {
        return null;
      }

      // Check if session has expired
      if (session.endTime && new Date() > session.endTime) {
        await this.terminateSession(session.id, session.organizationId);
        return null;
      }

      return session;
    } catch (error) {
      console.error('Error getting active session:', error);
      return null;
    }
  }

  async getUserActiveSessions(userId: string, organizationId?: string): Promise<any[]> {
    try {
      const where: any = {
        userId,
        status: 'ACTIVE',
        endTime: {
          gt: new Date()
        }
      };
      if (organizationId) where.organizationId = organizationId;

      return await prisma.session.findMany({
        where,
        include: {
          plan: true
        },
        orderBy: {
          startTime: 'desc'
        }
      });
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  async updateSessionUsage(sessionToken: string, dataUsed: number): Promise<void> {
    try {
      await prisma.session.update({
        where: { sessionToken },
        data: { dataUsed }
      });
    } catch (error) {
      console.error('Error updating session usage:', error);
    }
  }

  private parseSpeedLimit(speedLimit: string): string {
    // Convert "10Mbps" to "10M/10M" format for MikroTik
    const speed = speedLimit.replace(/[^\d]/g, '');
    const unit = speedLimit.includes('Gbps') ? 'G' : 'M';
    return `${speed}${unit}/${speed}${unit}`;
  }
}

// Cleanup expired sessions (scoped to all organizations)
export const sessionCleanup = async (): Promise<void> => {
  try {
    const expiredSessions = await prisma.session.findMany({
      where: {
        status: 'ACTIVE',
        endTime: {
          lt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    for (const session of expiredSessions) {
      await new SessionService().terminateSession(session.id, session.organizationId);

      // Send expiry notification
      const user = session.user;
      if (user) {
        await smsService.sendSMS(
          user.phone,
          'Your internet session has expired. Purchase a new plan to continue browsing. - Qrouter'
        );
      }
    }

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  } catch (error) {
    console.error('Error during session cleanup:', error);
  }
};

export default new SessionService();