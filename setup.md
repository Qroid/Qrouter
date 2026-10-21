# Qrouter Setup and Local Operations

This guide is for the project owner and developers running Qrouter locally. All commands start in the repository root unless stated otherwise. The recommended development setup runs PostgreSQL and Redis in Docker, with the backend and frontend running through npm on your machine.

> Do not use these development credentials or expose these services publicly in production. Do not run database initialization or seed commands against a live customer database without reviewing their effects and taking a backup.

## 1. Prerequisites

- Git.
- Node.js 18+ and npm (use a currently supported Node.js LTS release).
- Docker with Docker Compose v2, installed and running.
- Available ports: `3000` (frontend), `5000` (backend), `5432` (PostgreSQL), and `6379` (Redis).

Check your tools:

```bash
node --version
npm --version
docker --version
docker compose version
```

Clone the repository if you have not already:

```bash
git clone https://github.com/Qroid/Qrouter.git
cd Qrouter
```

Private-repository access requires an authorized GitHub account.

## 2. Install dependencies

```bash
npm run install:all
```

This installs the root, backend, and frontend dependencies.

## 3. Configure the local environment

Create the backend environment file once; do not overwrite an existing configuration:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell, use `Copy-Item backend/.env.example backend/.env` instead.

Edit `backend/.env` with these local values:

```env
DATABASE_URL="postgresql://qrouter:qrouter123@localhost:5432/qrouter_db"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="7d"
PORT=5000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"
REDIS_URL="redis://localhost:6379"
```

Generate a JWT secret and copy its output into `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep `.env` private and never commit credentials. The database credentials above match the repository's local Compose service. If you change them, update both configurations consistently.

The frontend defaults to `/api`; Vite proxies those requests to the backend on port `5000`. No frontend environment file is required for this local setup. An existing `VITE_API_URL` override must point to the intended API or be removed.

`NODE_ENV=development` enables the local fallback to the first active organization. Outside development, API requests need tenant resolution through an organization header or matching subdomain.

## 4. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
docker compose ps
docker compose exec postgres pg_isready -U qrouter -d qrouter_db
```

Wait until PostgreSQL reports that it is accepting connections before continuing. Only the database and Redis are started here; do not start the Compose backend/frontend alongside the npm servers, because their ports conflict.

## 5. Initialize the development database

For a new local database:

```bash
npm run db:setup
```

This runs, in order:

1. `prisma generate` — generates the Prisma client.
2. `prisma db push` — applies the current schema to the configured database.
3. The seed script — creates the default organization, admin account, and example plans.

> **Seed warning:** The seed script deletes and recreates the default organization's plans. Do not routinely rerun `db:setup` on an existing database or use it as a production migration process. Review schema changes before applying them.

The current seed script uses the fixed admin credentials below; editing `ADMIN_EMAIL` or `ADMIN_PASSWORD` in `.env` does not change those seeded credentials.

## 6. Start the application

```bash
npm run dev
```

Keep this terminal open. The command starts both development servers. Alternatively, use separate terminals from the repository root:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

### Application addresses

| Application | Local URL |
| --- | --- |
| Customer portal | http://localhost:3000 |
| Admin login | http://localhost:3000/admin/login |
| Admin dashboard | http://localhost:3000/admin |
| Backend health | http://localhost:5000/health |
| Public plans API | http://localhost:5000/api/public/plans |

Default seeded admin:

- **Email:** `admin@qrouter.com`
- **Password:** `admin123`

Replace default credentials before any public use.

## 7. Verify the local setup

```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/public/plans
curl http://localhost:3000/api/public/plans
```

The health endpoint should report `status: "OK"`. The plans endpoints should return `success: true` and a `data` array. The frontend URL also verifies the Vite API proxy. PowerShell users can use `curl.exe` or open these URLs in a browser.

A successful health response alone does not verify database connectivity; the plans request exercises database access and tenant resolution.

## Subsequent local starts

Once dependencies, configuration, and the database are ready:

```bash
docker compose up -d postgres redis
npm run dev
```

Do not reseed for every startup. After pulling dependency changes, rerun `npm run install:all`. For schema changes, review the change and follow the project's database change procedure rather than blindly resetting or seeding data.

## Troubleshooting: “Failed to load plans” or HTTP 500

The customer portal loads plans from `GET /api/public/plans`. The popup is a generic failure message, not a diagnosis.

1. Open the backend health URL and both plans URLs listed above.
2. Inspect the failed request's status and response in browser Developer Tools → Network.
3. Check the backend terminal for errors at the same time.
4. Confirm PostgreSQL is running and ready:

   ```bash
   docker compose ps
   docker compose logs --tail=100 postgres
   docker compose exec postgres pg_isready -U qrouter -d qrouter_db
   ```

5. Verify `backend/.env` has the matching `DATABASE_URL` and `NODE_ENV=development`; restart the backend after changing environment values.
6. If this is a **new, disposable local database** that has never been initialized, run the initialization sequence:

   ```bash
   docker compose up -d postgres redis
   npm run db:setup
   npm run dev
   ```

   Stop any existing npm development servers first. Do not run this recovery sequence against a populated or production database: seeding replaces default plans.

### Interpreting results

| Result | What to check |
| --- | --- |
| Backend unreachable | Backend startup output and port `5000` |
| Backend plans work, frontend plans fail | Vite proxy, frontend port, and `VITE_API_URL` overrides |
| Organization missing / HTTP 400 | Development mode or explicit organization header/subdomain |
| HTTP 500 | Database availability, credentials, schema, Prisma client, and backend logs; do not assume a single cause |
| Successful response with an empty array | Active plans for the selected organization; this is not a server error |
| Authentication failure after initialization | Whether seed completed and whether the account already existed; seed does not reset an existing admin password |

Outside development, a direct diagnostic request can specify a real organization ID:

```bash
curl -H "X-Organization-ID: YOUR_ORGANIZATION_ID" http://localhost:5000/api/public/plans
```

Use an actual ID from your database, not the organization slug. Do not enable development tenant fallback in production to bypass tenant configuration.

When reporting a failure, include the request URL, HTTP status, response body, and relevant backend error. Redact passwords, tokens, database connection strings, and personal data.

## Useful database commands

Run these from the repository root:

```bash
# Regenerate the Prisma client (does not seed data)
npm --prefix backend run db:generate

# Apply schema to a development database; review potential data changes first
npm --prefix backend run db:push

# Create/apply development migrations; review generated changes
npm --prefix backend run db:migrate

# Open Prisma Studio for inspection; edits modify the configured database
npm --prefix backend run db:studio
```

## Stop and restart

Press `Ctrl+C` in the development-server terminal, then stop supporting services if needed:

```bash
docker compose stop postgres redis
```

Restart using the subsequent-start commands above. Compose stores database data in a named volume. Do not run `docker compose down -v` unless you intentionally want to delete the Compose volumes and their data.

## Optional: PostgreSQL without Docker

If PostgreSQL is already installed locally, create a database and a user with appropriate permissions, then set `DATABASE_URL` to those credentials. Provision Redis separately if required by your environment. Skip the Docker startup commands and follow the same dependency installation, environment, initialization, and application-start steps.

Do not point at an existing service with different credentials and expect the Compose defaults to apply.

## External integrations and production boundary

Loading plans does not require live M-Pesa or MikroTik credentials. Payment collection, network access control, and notifications require their own configuration and verification:

- **M-Pesa:** Set Daraja credentials, shortcode, passkey, environment, and callback URL in the backend environment. Callbacks require a publicly reachable HTTPS endpoint; localhost cannot receive Safaricom callbacks directly.
- **MikroTik:** Configure router API host, port, username, and password, and ensure the backend can reach the router. Verify network operations against your actual NAS configuration.
- **SMS:** Configure Africa's Talking credentials before relying on SMS delivery.
- **RADIUS:** Use an external RADIUS server for accounting integration and configure the shared secret; this is not a built-in RADIUS authentication server.

For production planning, consult [DEPLOYMENT.md](DEPLOYMENT.md), but review all examples before use. Development startup commands are not a production deployment procedure. Production requires secure secrets, explicit tenant resolution, restricted database access, HTTPS, backups, monitoring, and tested integration credentials.
