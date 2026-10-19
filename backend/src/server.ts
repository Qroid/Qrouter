import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';

import authRoutes from './routes/auth';
import planRoutes from './routes/plans';
import paymentRoutes from './routes/payments';
import sessionRoutes from './routes/sessions';
import adminRoutes from './routes/admin';
import publicRoutes from './routes/public';
import billingRoutes from './routes/billing';
import networkRoutes from './routes/network';
import radiusRoutes from './routes/radius';

import { errorHandler } from './middleware/errorHandler';
import { resolveTenant } from './middleware/auth';
import { sessionCleanup } from './services/sessionService';
import billingService from './services/billingService';
import nasService from './services/nas';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Organization-ID',
    'X-Tenant',
    'X-Requested-With'
  ]
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100,
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && req.path.includes('/auth/');
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Tenant resolution (multi-tenancy) - applies to all API routes
app.use('/api', resolveTenant);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/radius', radiusRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'qrouter-backend' });
});

// Error handling
app.use(errorHandler);

// Cron jobs - cleanup expired sessions every 5 minutes
cron.schedule('*/5 * * * *', () => {
  sessionCleanup();
});

// Cron jobs - NAS health sweep every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    const result = await nasService.healthCheck();
    if (result.checked > 0) {
      console.log(`🛰️  NAS health: ${result.reachable} reachable, ${result.unreachable} unreachable`);
    }
  } catch (error) {
    console.error('NAS health check failed:', error);
  }
});

// Cron jobs - renew due subscriptions nightly at 02:00
cron.schedule('0 2 * * *', async () => {
  try {
    const result = await billingService.processDueSubscriptions();
    console.log(`💳 Renewals: ${result.renewed} renewed, ${result.pastDue} past due`);
  } catch (error) {
    console.error('Subscription renewal sweep failed:', error);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Qrouter Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV}`);
});

export default app;