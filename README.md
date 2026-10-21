# Qrouter

### ISP operations. Customer access. Revenue control.

Qrouter is an ISP management platform developed by **Qroid** for wireless internet providers. It brings subscriber management, internet packages, payments, billing, and network operations into one organization-based application.

The product direction is a subscription-based service for ISP operators: help providers manage their customers and connectivity while building a sustainable platform business.

> **Status:** Active product development. Core billing and network-management foundations are implemented. Platform subscription payments, entitlement enforcement, and commercial onboarding remain product milestones—not available features.

## The Problem We Solve

Running an ISP requires coordination between customer accounts, payment records, internet packages, and router access. Disconnected tools make it harder to track revenue, manage service access, and respond to network issues.

Qrouter is being built to bring these workflows together, with M-Pesa integration for Kenyan operators and organization-scoped operations for multiple ISP businesses.

## Product Capabilities

| Area | Current scope |
| --- | --- |
| **Subscriber management** | Organization-scoped customer accounts, registration, login, and administrative management |
| **Internet packages** | Plan pricing, duration, data-limit, and speed-limit settings |
| **Customer payments** | M-Pesa Daraja payment initiation and callback processing |
| **Billing** | Customer wallets, invoices, recurring subscriptions, tax handling, and scheduled renewal processing |
| **Network operations** | NAS registration, MikroTik integration, connectivity checks, and session disconnect operations |
| **Monitoring** | Scheduled NAS health checks, network alerts, and RADIUS accounting ingestion |
| **Administration** | Dashboard, JWT authentication, role-based authorization, and audit logging |
| **Business separation** | Organization-based request scoping and authenticated user-to-organization checks |

**Current integration boundaries:** MikroTik is the implemented NAS adapter. RADIUS accounting ingestion connects to an external RADIUS server; Qrouter does not currently provide a RADIUS authentication server. Ubiquiti and Cisco adapters remain planned.

## Two Revenue Layers

### 1. ISP revenue from subscribers

Qrouter's existing billing foundation supports the relationship between an ISP and its customers: internet packages, customer payments, invoices, wallets, and recurring service subscriptions.

### 2. Qrouter revenue from ISP operators

The commercial goal is to charge ISP businesses for access to Qrouter itself. This is a separate billing relationship from the ISP's customer billing and requires dedicated platform-level controls.

Planned platform capabilities include:

- ISP subscription plans with defined features and usage limits.
- Organization-level subscription status and payment tracking.
- Server-side entitlement enforcement for paid functionality.
- Trial, renewal, grace-period, suspension, and reactivation workflows.
- Operator onboarding and platform-owner administration.

An organization record or a hidden frontend screen is not a complete paywall. Paid access must be enforced in the backend and tested across protected operations.

## Priorities for Commercial Readiness

1. **Validate core operations:** Verify customer onboarding, M-Pesa payment reconciliation, billing accuracy, and MikroTik access control end to end.
2. **Strengthen business isolation:** Review tenant boundaries, permissions, audit coverage, and sensitive-data handling.
3. **Build platform subscriptions:** Separate Qrouter-to-ISP billing from ISP-to-customer billing and implement server-side entitlements.
4. **Prepare reliable operations:** Establish backups, recovery procedures, monitoring, secure secrets management, and integration-failure handling.
5. **Pilot with real operators:** Validate usability, support needs, pricing, and service reliability before broader paid rollout.

These are delivery priorities, not claims of production readiness.

## Ownership and Direction

Qrouter is developed and maintained by **Qroid**. The focus is a commercially sustainable ISP operations product, not a public installation tutorial.

Repository visibility, licensing, and customer access are separate decisions. A private repository can protect source access; paid product access still requires application-level billing and entitlement enforcement.
