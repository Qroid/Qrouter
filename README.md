# Qrouter

**Multi-tenant ISP management and Wi-Fi billing platform.**

Qrouter is developed by Qroid for wireless internet service providers. It brings customer access, internet plans, payments, recurring billing, and router management into a single web application, with M-Pesa integration for Kenyan operators.

> **Project status:** Active development. Billing and network-management foundations are implemented; additional payment methods, router adapters, and monitoring capabilities remain planned. Review and secure the configuration before any production deployment.

## Capabilities

### Customer access and payments

- Customer portal for registration, login, plan selection, and connection management.
- Internet packages with duration, price, data-limit, and speed-limit settings.
- M-Pesa Daraja integration for payment initiation and callback processing.
- Customer wallet balances and invoice access through authenticated billing endpoints.

### ISP administration

- Organization-scoped customer, plan, payment, and session management.
- JWT authentication and role-based authorization for protected endpoints.
- Administrative dashboard with billing and network-management screens.
- Audit logging for administrative operations.

### Billing

- Recurring subscriptions with monthly, quarterly, and yearly billing cycles.
- Invoice generation with organization-specific numbering and tax handling.
- Wallet credit/debit operations and invoice payment APIs.
- Scheduled subscription renewal processing and past-due handling.

### Network management

- Organization-scoped router/NAS registration and connectivity checks.
- Vendor-neutral adapter interface with a MikroTik implementation.
- Session disconnect operations through the network service.
- HTTP ingestion of RADIUS accounting events: Start, Interim-Update, and Stop.
- Scheduled NAS health checks with network-alert creation and resolution.

RADIUS accounting ingestion is an integration endpoint for an external RADIUS server, not a built-in RADIUS authentication server. Ubiquiti and Cisco adapters are not yet implemented.

## Architecture

```text
Customer portal / Admin dashboard
          React + TypeScript
                  |
             REST API
          Express + TypeScript
                  |
        +---------+---------+
        |                   |
  PostgreSQL / Prisma   Integration services
                        M-Pesa · MikroTik · SMS
```

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| Authentication | JSON Web Tokens and role-based middleware |
| Scheduled jobs | node-cron |
| Integrations | M-Pesa Daraja, MikroTik RouterOS API, Africa's Talking SMS |
| Deployment tooling | Dockerfiles and Docker Compose |

Redis is included in the Compose configuration for caching/session infrastructure; its presence does not imply that all application caching is implemented.

## Multi-tenancy

API requests pass through tenant-resolution middleware. An organization can be selected using:

- `X-Organization-ID`: organization ID.
- `X-Tenant`: alternate organization-ID header.
- A hostname subdomain matching an organization slug.

In development mode, requests without an explicit tenant can fall back to the first active organization. Outside development, an organization must be resolved. Authenticated requests also verify that the user belongs to the selected organization.

## API Overview

| Base path | Responsibility |
| --- | --- |
| `/api/auth` | Admin login, current user, and profile updates |
| `/api/public` | Customer registration, login, plans, payments, and connectivity |
| `/api/admin` | Administrative dashboard and ISP operations |
| `/api/plans` | Plan operations |
| `/api/payments` | Payment operations |
| `/api/sessions` | Session operations |
| `/api/billing` | Wallets, invoices, and recurring subscriptions |
| `/api/network` | NAS devices, connectivity checks, and session disconnects |
| `/api/radius` | Accounting ingestion and accounting-session queries |
| `/health` | Backend health response; outside tenant-resolution middleware |

Access requirements vary by route. Protected endpoints require a bearer token and the appropriate role; the route definitions in [`backend/src/routes`](backend/src/routes) are the source of truth for request validation and permissions.

## Repository Structure

```text
backend/
  prisma/             Database schema
  src/
    database/         Seed data
    middleware/       Authentication, tenancy, and error handling
    routes/           REST endpoints
    services/         Billing, payments, sessions, and NAS integrations
frontend/
  src/                Customer portal and admin application
setup.md              Local development instructions
docker-compose.yml    Container service definitions
```

## Documentation

- [Local development setup](setup.md)
- [Deployment guide](DEPLOYMENT.md)
- [Backend environment template](backend/.env.example)
- [Database schema](backend/prisma/schema.prisma)

Deployment examples and placeholder credentials must be reviewed and replaced for your environment. Production use requires appropriate secrets, HTTPS termination, database access controls, and verified integration configuration. M-Pesa callbacks require a publicly reachable HTTPS URL.

## Roadmap

- Additional payment methods and past-due email/SMS reminders.
- Ubiquiti and Cisco NAS adapters.
- RADIUS authentication-server integration.
- Live network monitoring over WebSocket.
- Support-ticket workflows, email notifications, mobile applications, and advanced analytics.

These items describe planned work, not currently available features.

## Contributing

Contributions are welcome. Include a clear description of the change, relevant verification steps, and any configuration or database-schema implications in your pull request.
