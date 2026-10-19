# Qrouter - ISP Management Platform

**"Connect. Pay. Browse — Seamlessly."**

Qrouter is an independent WISP/ISP management platform built and maintained by Qroid. It gives wireless internet service providers one place to run subscribers, plans, billing, routers and network monitoring.

Routers are reached through a vendor-neutral NAS adapter interface, so MikroTik is supported today and Ubiquiti, Cisco and plain RADIUS can be added without touching the services that use them.

## 🌟 Features

### 🏢 Multi-Tenancy
- **Organization-based isolation**: Each ISP gets its own organization with isolated data
- **Subdomain or header-based routing**: `X-Organization-ID` header or subdomain (e.g., `myisp.qrouter.com`)
- **Per-organization branding**: Custom colors, logos, captive portal themes
- **Currency & tax settings**: Per-organization currency (KES, USD, etc.) and tax rates

### 👥 Customer Features
- **Captive Portal**: Custom-branded login page with mobile-first design
- **M-Pesa Integration**: STK Push and Paybill payments via Daraja API
- **Multiple Plans**: Time-based, data-based, and subscription packages
- **Auto-Connect**: Automatic internet access after payment
- **Real-time Status**: Connection status and usage monitoring
- **Wallet/Credit**: Prepaid balance, top-up, and credit management
- **Multi-language**: English and Swahili support

### 💼 Admin Features
- **Dashboard**: Real-time analytics and system monitoring per organization
- **User Management**: Customer account management and activity tracking
- **Plan Management**: Create and manage internet packages with recurring billing
- **Session Control**: Monitor and terminate user sessions (CoA support)
- **Payment Tracking**: Complete payment history, invoices, and reporting
- **Router Integration**: MikroTik API for bandwidth and access control
- **RBAC**: SUPER_ADMIN, ADMIN, TECHNICIAN, SUPPORT, AGENT, CUSTOMER roles
- **Audit Logging**: Full audit trail of all admin actions
- **Support Tickets**: Customer support ticketing system
- **NAS Management**: Multi-router support (MikroTik, Ubiquiti, Cisco)

### 🔧 Technical Features
- **Modern Stack**: React 18 + TypeScript + Node.js + PostgreSQL + Prisma
- **Security**: JWT authentication, 2FA, HTTPS, rate limiting, API keys
- **Scalable**: Multi-tenant, cloud-ready with Docker, Redis caching
- **Notifications**: SMS (Africa's Talking), Email, Push notifications
- **API-First**: RESTful API with versioning, API keys, webhooks
- **RADIUS Ready**: NAS/RADIUS accounting tables for Phase 3 integration

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Customer      │    │   Admin         │    │   MikroTik      │
│   Portal        │    │   Dashboard     │    │   Router (NAS)  │
│   (React)       │    │   (React)       │    │   (API/RADIUS)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Backend API   │
                    │   (Node.js)     │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Multi-tenant)│
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Redis         │
                    │   (Cache/Sessions)│
                    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 7+ (for caching)
- MikroTik router with API access (optional, for hotspot control)
- M-Pesa Daraja API credentials (for payments)
- Africa's Talking SMS API (optional, for notifications)

### 1. Clone Repository
```bash
git clone <repository-url>
cd qrouter
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration (DATABASE_URL, JWT_SECRET, etc.)
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4. Access Applications
- **Customer Portal**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
- **API Health**: http://localhost:5000/health

### 5. Docker Deployment (Recommended)
```bash
docker-compose up -d
docker-compose exec backend npm run db:seed
```

## 📋 Configuration

### Backend (.env)
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/qrouter_db"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_EXPIRES_IN="7d"

# Server
PORT=5000
NODE_ENV="development"

# Multi-tenancy
DEFAULT_ORGANIZATION_NAME="Qrouter ISP"
DEFAULT_ORGANIZATION_SLUG="qrouter"

# M-Pesa Daraja API
MPESA_CONSUMER_KEY="your-mpesa-consumer-key"
MPESA_CONSUMER_SECRET="your-mpesa-consumer-secret"
MPESA_SHORTCODE="174379"
MPESA_PASSKEY="your-mpesa-passkey"
MPESA_CALLBACK_URL="https://yourdomain.com/api/public/payment/mpesa/callback"
MPESA_ENVIRONMENT="sandbox"

# SMS (Africa's Talking)
AFRICASTALKING_USERNAME="sandbox"
AFRICASTALKING_API_KEY="your-africastalking-api-key"

# MikroTik Router
MIKROTIK_HOST="192.168.1.1"
MIKROTIK_USERNAME="admin"
MIKROTIK_PASSWORD="your-router-password"
MIKROTIK_PORT="8728"

# Redis
REDIS_URL="redis://localhost:6379"

# Admin Credentials
ADMIN_EMAIL="admin@qrouter.com"
ADMIN_PASSWORD="admin123"
```

### Default Admin Credentials
- **Email**: admin@qrouter.com
- **Password**: admin123

## 💰 Payment Plans (Default)

| Plan | Duration | Price | Data Limit | Speed |
|------|----------|-------|------------|-------|
| Basic 1 Hour | 1 hour | KES 20 | 500MB | 5Mbps |
| Standard 6 Hours | 6 hours | KES 100 | 2GB | 10Mbps |
| Premium 24 Hours | 24 hours | KES 300 | 10GB | 20Mbps |
| Weekly Package | 7 days | KES 1,500 | 50GB | 25Mbps |
| Monthly Unlimited | 30 days | KES 5,000 | Unlimited | 50Mbps |

## 🔌 API Endpoints

### Public API (Customer Portal) — `GET /api/public/plans`
- `GET /api/public/plans` - Get available plans (scoped to org)
- `POST /api/public/register` - Register new user
- `POST /api/public/login` - User login
- `POST /api/public/payment` - Initiate M-Pesa payment
- `GET /api/public/payment/status/:checkoutRequestId` - Check payment status
- `POST /api/public/connect` - Connect to internet
- `POST /api/public/payment/mpesa/callback` - M-Pesa callback

### Admin API — Requires Authentication + Organization
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/users` - Get all users (org-scoped)
- `POST /api/admin/plans` - Create plan
- `GET /api/admin/plans` - Get plans
- `PUT /api/admin/plans/:id` - Update plan
- `DELETE /api/admin/plans/:id` - Deactivate plan
- `GET /api/admin/sessions` - Monitor sessions
- `POST /api/admin/sessions/:id/terminate` - Terminate session
- `GET /api/admin/payments` - Payment history
- `GET /api/admin/router/status` - Router status

### Network
- `GET /api/network/overview` - Devices, live sessions and open alerts
- `GET /api/network/devices` - Routers registered for the organization
- `POST /api/network/devices` - Register a router / NAS
- `POST /api/network/devices/:id/test` - Connectivity check through the adapter
- `POST /api/network/sessions/:sessionId/disconnect` - Change of Authorization (CoA)
- `GET /api/radius/sessions` - RADIUS accounting records (staff)

### Billing (Phase 2)
- `GET /api/billing/my/wallet` - Authenticated customer wallet + recent transactions
- `GET /api/billing/my/invoices` - Customer invoices
- `POST /api/billing/invoices/:id/pay` - Pay an invoice (wallet, or manual method for staff)
- `GET /api/billing/invoices` - All organization invoices (admin)
- `GET /api/billing/subscriptions` - Recurring subscriptions (admin)
- `POST /api/billing/subscriptions` - Start a subscription and open its first invoice (admin)
- `POST /api/billing/subscriptions/:id/cancel` - Cancel a subscription (admin)
- `POST /api/billing/wallets/topup` - Credit a customer wallet (admin)

### Auth API
- `POST /api/auth/admin/login` - Admin login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Headers
All API requests (except health check) require `X-Organization-ID` header for multi-tenant scoping.

## 🛠️ Development

### Database Schema
The system uses Prisma ORM with PostgreSQL. Key models:
- **Organization** - Multi-tenant container
- **User** - Customers and staff (scoped to organization)
- **Plan** - Internet packages (scoped to organization)
- **Session** - Active user connections
- **Payment** - M-Pesa and other transactions
- **Invoice** - Billing invoices
- **Wallet** - Customer prepaid balance
- **Subscription** - Recurring plans
- **NasDevice** - Router/NAS management
- **AuditLog** - Change tracking
- **Ticket** - Support tickets
- **NotificationTemplate** - SMS/Email templates

### Commands
```bash
# Generate Prisma client
cd backend && npm run db:generate

# Push schema to database
npm run db:push

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Open Prisma Studio
npm run db:studio
```

## 🚀 Deployment

### Using Docker Compose
```bash
# Build and run
docker-compose up -d

# Seed database
docker-compose exec backend npm run db:seed

# View logs
docker-compose logs -f
```

### Manual Deployment (Production)
1. Set up PostgreSQL database
2. Set up Redis for caching
3. Configure environment variables
4. Build frontend: `npm run build`
5. Start backend: `npm start`
6. Serve frontend with Nginx
7. Configure SSL certificates

### Cloud Deployment (AWS/DigitalOcean)
1. Set up EC2 instance or Droplet (2+ vCPU, 4GB+ RAM)
2. Install Node.js, PostgreSQL, Redis, Nginx
3. Configure SSL (Let's Encrypt)
4. Set up domain and DNS
5. Configure M-Pesa callback URLs (must be HTTPS)

## 🔒 Security Features

- **HTTPS Enforcement**: SSL/TLS encryption
- **JWT Authentication**: Secure token-based auth with organization scoping
- **Rate Limiting**: API request throttling
- **Input Validation**: Comprehensive data validation (express-validator)
- **SQL Injection Protection**: Prisma ORM parameterized queries
- **CORS Configuration**: Cross-origin request control
- **2FA Support**: Two-factor authentication ready
- **API Keys**: Secure third-party integrations
- **Audit Logging**: Full action tracking

## 📊 Roadmap

- **Phase 1**: Multi-tenancy, RBAC, PostgreSQL, audit logging ✅
- **Phase 2**: Recurring billing, invoices, wallet system, multi-payment methods 🚧
  - Done: subscriptions with MONTHLY/QUARTERLY/YEARLY cycles, nightly renewal sweep,
    invoice generation with per-organization numbering and tax handling, wallet
    credit/debit, invoice payment API, admin + self-service billing endpoints,
    Billing screen in the admin dashboard
  - Remaining: payment methods beyond M-Pesa, dunning emails/SMS for PAST_DUE
- **Phase 3** (Current): Network layer — routers/NAS, RADIUS, CoA, monitoring 🚧
  - Done: vendor-neutral NAS adapter interface with a MikroTik implementation,
    device registry per organization, RADIUS accounting ingestion
    (Start/Interim-Update/Stop), CoA disconnect, 15-minute health sweep that
    raises and auto-resolves NetworkAlerts, Network screen in the dashboard
  - Remaining: Ubiquiti/Cisco adapters, RADIUS authentication server,
    live monitoring over WebSocket
- **Phase 4**: Support tickets, email notifications, mobile app, advanced analytics

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Contact

- **Email**: support@qrouter.com
- **Phone**: +254 700 000 000
- **Website**: https://qrouter.com