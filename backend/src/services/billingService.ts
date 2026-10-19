import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface WalletOperation {
  organizationId: string;
  userId: string;
  amount: number;
  description?: string;
  paymentId?: string;
}

export interface SubscriptionInput {
  organizationId: string;
  userId: string;
  planId: string;
  billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
}

/**
 * Recurring billing: subscriptions, invoice generation, wallet payments and
 * the renewal sweep driven by the nightly cron job.
 *
 * Every entry point takes an explicit organizationId and re-scopes its reads:
 * a caller must never be able to act on another tenant's records.
 */
export class BillingService {
  // ─────────────────────────── Wallet ───────────────────────────

  async getWallet(userId: string, organizationId: string) {
    return prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, organizationId }
    });
  }

  async creditWallet({ organizationId, userId, amount, description, paymentId }: WalletOperation) {
    if (amount <= 0) {
      throw new Error('Credit amount must be greater than zero');
    }

    const wallet = await this.getWallet(userId, organizationId);

    // Single conditional UPDATE: the balance check and the increment are one
    // statement, so concurrent top-ups cannot lose an update.
    const updated = await prisma.wallet.updateMany({
      where: { id: wallet.id, organizationId },
      data: { balance: { increment: amount } }
    });

    if (updated.count === 0) {
      throw new Error('Wallet not found');
    }

    const refreshed = await prisma.wallet.findUnique({ where: { id: wallet.id } });

    return prisma.walletTransaction.create({
      data: {
        organizationId,
        walletId: wallet.id,
        paymentId: paymentId ?? null,
        type: 'CREDIT',
        amount,
        balanceAfter: refreshed?.balance ?? round2(wallet.balance + amount),
        description: description ?? 'Wallet top-up'
      }
    });
  }

  async debitWallet({ organizationId, userId, amount, description }: WalletOperation) {
    if (amount <= 0) {
      throw new Error('Debit amount must be greater than zero');
    }

    const wallet = await this.getWallet(userId, organizationId);

    // Atomic: only decrements when the balance covers the charge.
    const updated = await prisma.wallet.updateMany({
      where: { id: wallet.id, organizationId, balance: { gte: amount } },
      data: { balance: { decrement: amount } }
    });

    if (updated.count === 0) {
      throw new Error('Insufficient wallet balance');
    }

    const refreshed = await prisma.wallet.findUnique({ where: { id: wallet.id } });

    return prisma.walletTransaction.create({
      data: {
        organizationId,
        walletId: wallet.id,
        type: 'DEBIT',
        amount,
        balanceAfter: refreshed?.balance ?? round2(wallet.balance - amount),
        description: description ?? 'Wallet payment'
      }
    });
  }

  // ─────────────────────── Subscriptions ───────────────────────

  private advance(periodEnd: Date, cycle: string): Date {
    const next = new Date(periodEnd);
    switch (cycle) {
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  async createSubscription({ organizationId, userId, planId, billingCycle }: SubscriptionInput) {
    const plan = await prisma.plan.findFirst({
      where: { id: planId, organizationId, isActive: true }
    });

    if (!plan) {
      throw new Error('Plan not found or inactive');
    }

    const cycle = billingCycle ?? 'MONTHLY';
    const start = new Date();

    const subscription = await prisma.subscription.create({
      data: {
        organizationId,
        userId,
        planId,
        billingCycle: cycle,
        status: 'TRIAL',
        currentPeriodStart: start,
        currentPeriodEnd: this.advance(start, cycle)
      }
    });

    const invoice = await this.generateInvoice(subscription.id, organizationId);

    return { subscription, invoice };
  }

  async cancelSubscription(subscriptionId: string, organizationId: string, immediate = false) {
    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, organizationId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: immediate ? 'CANCELLED' : 'ACTIVE',
        cancelledAt: new Date()
      }
    });
  }

  // ───────────────────────── Invoices ─────────────────────────

  private async nextInvoiceNumber(organizationId: string): Promise<string> {
    const count = await prisma.invoice.count({ where: { organizationId } });
    const period = new Date().toISOString().slice(0, 7).replace('-', '');
    return `INV-${period}-${String(count + 1).padStart(5, '0')}`;
  }

  async generateInvoice(subscriptionId: string, organizationId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, organizationId },
      include: { plan: true, organization: true }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const priorInvoices = await prisma.invoice.count({
      where: { subscriptionId, organizationId }
    });

    // The setup fee is billed once, on the first invoice of a subscription.
    const setupFee = priorInvoices === 0 ? subscription.plan.setupFee : 0;
    const subtotal = round2(subscription.plan.price + setupFee);
    const taxRate = subscription.organization.taxRate ?? 0;
    const tax = subscription.plan.taxIncluded ? 0 : round2(subtotal * taxRate);
    const total = round2(subtotal + tax);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        number: await this.nextInvoiceNumber(organizationId),
        status: 'OPEN',
        subtotal,
        tax,
        total,
        currency: subscription.organization.currency,
        dueAt: subscription.currentPeriodEnd,
        items: {
          create: [
            {
              description: `${subscription.plan.name} (${subscription.billingCycle.toLowerCase()})`,
              quantity: 1,
              unitPrice: subscription.plan.price,
              amount: subscription.plan.price
            },
            ...(setupFee > 0
              ? [
                  {
                    description: 'Setup fee',
                    quantity: 1,
                    unitPrice: setupFee,
                    amount: setupFee
                  }
                ]
              : [])
          ]
        }
      },
      include: { items: true }
    });

    return invoice;
  }

  /** Settle an invoice from the customer wallet, or record a manual payment. */
  async payInvoice(
    invoiceId: string,
    organizationId: string,
    options: { method: 'WALLET' | 'MPESA' | 'CASH' | 'CARD' | 'BANK_TRANSFER'; amount?: number; reference?: string }
  ) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { subscription: true }
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      throw new Error(`Invoice is already ${invoice.status.toLowerCase()}`);
    }

    const outstanding = round2(invoice.total - invoice.amountPaid);
    const amount = round2(options.amount ?? outstanding);

    if (amount <= 0) {
      throw new Error('Nothing outstanding on this invoice');
    }

    if (options.method === 'WALLET') {
      await this.debitWallet({
        organizationId,
        userId: invoice.userId,
        amount,
        description: `Invoice ${invoice.number}`
      });
    }

    await prisma.payment.create({
      data: {
        organizationId,
        userId: invoice.userId,
        planId: invoice.subscription?.planId ?? null,
        invoiceId: invoice.id,
        amount,
        status: 'COMPLETED',
        paymentMethod: options.method,
        mpesaReceiptNumber: options.reference ?? null,
        metadata: { source: 'billing', invoiceNumber: invoice.number }
      }
    });

    const amountPaid = round2(invoice.amountPaid + amount);

    return prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid,
        status: amountPaid >= invoice.total ? 'PAID' : 'OPEN',
        paidAt: amountPaid >= invoice.total ? new Date() : null
      },
      include: { items: true, payments: true }
    });
  }

  // ───────────────────── Renewal sweep ─────────────────────

  /**
   * Charge every subscription whose period has elapsed. Runs from the nightly
   * cron job. Failures are contained per subscription: one bad tenant record
   * must not abort the sweep.
   */
  async processDueSubscriptions(): Promise<{ renewed: number; pastDue: number }> {
    const due = await prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
        currentPeriodEnd: { lte: new Date() }
      },
      include: { plan: true, organization: true }
    });

    let renewed = 0;
    let pastDue = 0;

    for (const subscription of due) {
      try {
        const taxRate = subscription.organization.taxRate ?? 0;
        const amount = subscription.plan.taxIncluded
          ? round2(subscription.plan.price)
          : round2(subscription.plan.price * (1 + taxRate));

        await this.debitWallet({
          organizationId: subscription.organizationId,
          userId: subscription.userId,
          amount,
          description: `Renewal: ${subscription.plan.name}`
        });

        await prisma.payment.create({
          data: {
            organizationId: subscription.organizationId,
            userId: subscription.userId,
            planId: subscription.planId,
            amount,
            status: 'COMPLETED',
            paymentMethod: 'WALLET',
            metadata: { source: 'renewal', subscriptionId: subscription.id }
          }
        });

        const periodEnd = this.advance(
          subscription.currentPeriodEnd,
          subscription.billingCycle
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: periodEnd,
            status: 'ACTIVE'
          }
        });

        if (subscription.plan.isRecurring) {
          await this.generateInvoice(subscription.id, subscription.organizationId);
        }

        renewed += 1;
      } catch (error) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'PAST_DUE' }
        });
        pastDue += 1;
        console.error(`Renewal failed for subscription ${subscription.id}:`, error);
      }
    }

    return { renewed, pastDue };
  }
}

export default new BillingService();
