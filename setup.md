# Qrouter Local Development Setup

Run these commands from the Qrouter repository folder.

## Prerequisites

- Node.js 18+ and npm
- Docker with Docker Compose installed and running

## 1. Start the database and Redis

```bash
docker compose up -d postgres redis
```

## 2. Install dependencies and create your configuration

```bash
npm run install:all
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

```env
DATABASE_URL="postgresql://qrouter:qrouter123@localhost:5432/qrouter_db"
JWT_SECRET="replace-with-a-long-random-secret"
```

Replace the JWT secret with a long, random value. You can leave the other settings for initial setup. Real M-Pesa payments and router control require your actual credentials later.

## 3. Set up the database and launch

```bash
npm run db:setup
npm run dev
```

This initializes and seeds the database, then starts both the backend and frontend. Keep the terminal open while using the app.

## 4. Open the app

- **Customer portal:** http://localhost:3000
- **Admin dashboard:** http://localhost:3000/admin
- **Backend health:** http://localhost:5000/health

### Default seeded admin login

- **Email:** `admin@qrouter.com`
- **Password:** `admin123`

Change this password before exposing the app publicly. The Docker database credentials above are also for local development only.

## Subsequent starts

After the first setup, run:

```bash
docker compose up -d postgres redis
npm run dev
```

## Stopping the app

Press `Ctrl+C` in the development-server terminal. To stop the database and Redis as well:

```bash
docker compose stop postgres redis
```
