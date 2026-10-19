# Qrouter Deployment Guide

This guide covers different deployment options for the Qrouter ISP Management Platform.

## 🚀 Quick Deployment with Docker (Recommended)

### Prerequisites
- Docker and Docker Compose installed
- Domain name (for production)
- SSL certificates (for HTTPS)

### 1. Clone and Configure
```bash
git clone <repository-url>
cd qrouter
cp backend/.env.example backend/.env
```

### 2. Update Environment Variables
Edit `backend/.env` with your actual credentials:

```env
# Database
DATABASE_URL="postgresql://qrouter:qrouter123@localhost:5432/qrouter_db"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Multi-tenancy
DEFAULT_ORGANIZATION_NAME="Your ISP Name"
DEFAULT_ORGANIZATION_SLUG="your-isp"

# M-Pesa Daraja API
MPESA_CONSUMER_KEY="your-actual-consumer-key"
MPESA_CONSUMER_SECRET="your-actual-consumer-secret"
MPESA_SHORTCODE="174379"
MPESA_PASSKEY="your-passkey"
MPESA_CALLBACK_URL="https://yourdomain.com/api/public/payment/mpesa/callback"
MPESA_ENVIRONMENT="sandbox"

# SMS (Africa's Talking)
AFRICASTALKING_USERNAME="sandbox"
AFRICASTALKING_API_KEY="your-api-key"

# MikroTik Router
MIKROTIK_HOST="192.168.1.1"
MIKROTIK_USERNAME="admin"
MIKROTIK_PASSWORD="your-router-password"
MIKROTIK_PORT="8728"

# Redis
REDIS_URL="redis://localhost:6379"

# Admin Credentials
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="admin123"
```

### 3. Deploy
```bash
docker-compose up -d
```

### 4. Initialize Database
```bash
docker-compose exec backend npm run db:seed
```

### 5. Access
- **Customer Portal**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
- **API Health**: http://localhost:5000/health

---

## 🌐 Production Deployment (AWS/DigitalOcean)

### Server Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB SSD
- **OS**: Ubuntu 22.04 LTS or newer

### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Redis
sudo apt install redis-server -y

# Install Nginx
sudo apt install nginx -y

# Install PM2
sudo npm install -g pm2
```

### 2. Database Setup
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE qrouter_db;
CREATE USER qrouter WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE qrouter_db TO qrouter;
\q
```

### 3. Application Deployment
```bash
# Clone repository
git clone <repository-url> /var/www/qrouter
cd /var/www/qrouter

# Backend setup
cd backend
npm install
cp .env.example .env
# Edit .env with production values
npm run build
npm run db:generate
npm run db:push
npm run db:seed

# Frontend setup
cd ../frontend
npm install
npm run build
```

### 4. PM2 Configuration
Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'qrouter-backend',
    script: 'dist/server.js',
    cwd: '/var/www/qrouter/backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
}
```

Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Nginx Configuration
Create `/etc/nginx/sites-available/qrouter`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        root /var/www/qrouter/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Organization-ID $http_x_organization_id;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/qrouter /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🔧 MikroTik Router Configuration

### 1. Enable API
```bash
/ip service enable api
/ip service set api port=8728
```

### 2. Create API User
```bash
/user add name=qrouter password=secure-password group=full
```

### 3. Hotspot Setup
```bash
# Create hotspot interface
/interface bridge add name=hotspot-bridge
/ip hotspot add name=qrouter interface=hotspot-bridge

# Configure hotspot profile
/ip hotspot user profile add name=default rate-limit=1M/5M session-timeout=1h
```

---

## 📱 M-Pesa Integration Setup

### 1. Daraja API Registration
1. Visit [Daraja Portal](https://developer.safaricom.co.ke/)
2. Create account and new app
3. Get Consumer Key and Consumer Secret
4. Generate Passkey for your shortcode

### 2. Callback URL Configuration
- **Sandbox**: Use ngrok for testing
- **Production**: Use your domain with HTTPS

### 3. Testing
```bash
# Test STK Push
curl -X POST https://yourdomain.com/api/public/payment \
  -H "Content-Type: application/json" \
  -H "X-Organization-ID: your-org-id" \
  -d '{
    "phone": "254712345678",
    "planId": "plan-id",
    "amount": 100
  }'
```

---

## 📊 Monitoring & Maintenance

### 1. Log Management
```bash
# View backend logs
pm2 logs qrouter-backend

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# View Docker logs
docker-compose logs -f
```

### 2. Database Backup
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U qrouter -h localhost qrouter_db > /backups/qrouter_$DATE.sql
```

### 3. System Updates
```bash
# Update application
cd /var/www/qrouter
git pull origin main
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
pm2 restart qrouter-backend
```

### 4. Prisma Migrations (Production)
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

---

## 🔒 Security Checklist

- [ ] SSL certificate installed and configured
- [ ] Database password is strong and unique
- [ ] JWT secret is cryptographically secure (min 32 chars)
- [ ] API keys are kept secret and not in version control
- [ ] Firewall configured (UFW recommended)
- [ ] Regular security updates scheduled
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting set up
- [ ] Rate limiting enabled
- [ ] CORS configured for production domains only

---

## 🆘 Troubleshooting

### Common Issues

1. **502 Bad Gateway**
   - Check if backend is running: `pm2 status` or `docker ps`
   - Check backend logs
   - Verify port 5000 is not blocked

2. **Database Connection Error**
   - Check PostgreSQL status: `sudo systemctl status postgresql`
   - Verify DATABASE_URL in .env
   - Check database credentials

3. **M-Pesa Payments Failing**
   - Verify callback URL is accessible (must be HTTPS in production)
   - Check Daraja API credentials
   - Review payment logs

4. **Router Connection Issues**
   - Test MikroTik API connectivity
   - Verify router credentials
   - Check network connectivity
   - Ensure API service is enabled on MikroTik

5. **Tenant Resolution Error**
   - Ensure `X-Organization-ID` header is sent with API requests
   - Or configure subdomain routing in nginx

### Performance Optimization

1. **Database Indexes**
   ```sql
   CREATE INDEX idx_sessions_org_status ON sessions(organization_id, status);
   CREATE INDEX idx_payments_org_status ON payments(organization_id, status);
   CREATE INDEX idx_users_org ON users(organization_id);
   ```

2. **Redis Caching**
   - Session caching
   - Plan data caching
   - Dashboard stats caching

3. **Nginx Caching**
   ```nginx
   location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
       expires 1y;
       add_header Cache-Control "public, immutable";
   }
   ```

---

## 📞 Support

For deployment assistance:
- **Email**: support@qrouter.com
- **Documentation**: Check README.md
- **Issues**: Create GitHub issue