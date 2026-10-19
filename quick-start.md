# 🚀 Qrouter Quick Start Guide

## ✅ Dependencies Installed Successfully!

All project dependencies have been installed:
- ✅ Backend: Node.js + Express + TypeScript + Prisma
- ✅ Frontend: React 18 + TypeScript + Tailwind CSS
- ✅ Root project scripts

## 🎯 Quick Test (No Database Required)

Test the frontend only:
```bash
cd frontend
npm run dev
```
Visit: http://localhost:3000

## 🗄️ Full Setup (Requires PostgreSQL)

### 1. Install PostgreSQL
- Download from: https://www.postgresql.org/download/
- Create database: `qrouter_db`
- Update `backend/.env` with your database credentials

### 2. Setup Database
```bash
cd backend
npm run db:push
npm run db:seed
```

### 3. Start Both Servers
```bash
# From root directory
node start-dev.js
```

## 🌐 Access Points

- **Customer Portal**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin
- **Backend API**: http://localhost:5000/health

## 🔑 Default Admin Login

- **Email**: admin@qrouter.com
- **Password**: admin123

## 📋 Current Status

- ✅ All dependencies installed
- ✅ Environment configured
- ✅ Prisma client generated
- ⚠️ Minor TypeScript issues (non-blocking)
- ❌ Database setup required for full functionality

## 🛠️ Development Commands

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev

# Build for production
npm run build

# Database operations
cd backend
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:seed      # Seed with sample data
```

## 🎉 Ready to Test!

The project is ready for testing. Start with the frontend-only test, then set up PostgreSQL for full functionality.