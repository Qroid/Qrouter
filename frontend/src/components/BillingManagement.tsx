import React, { useState, useEffect } from 'react'
import { Receipt, Repeat, Wallet as WalletIcon, Plus, RefreshCw } from 'lucide-react'
import { adminAPI } from '../services/api'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'
import type {
  Invoice,
  Subscription,
  User,
  Plan,
  BillingCycle,
  PaginationMeta
} from '../types'

type Tab = 'invoices' | 'subscriptions' | 'wallets'

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { id: 'wallets', label: 'Wallets', icon: WalletIcon }
]

const invoiceStatusClass = (status: string): string => {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-100 text-emerald-700'
    case 'OPEN':
      return 'bg-amber-100 text-amber-700'
    case 'OVERDUE':
      return 'bg-red-100 text-red-700'
    case 'VOID':
      return 'bg-gray-200 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

const subscriptionStatusClass = (status: string): string => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700'
    case 'TRIAL':
      return 'bg-indigo-100 text-indigo-700'
    case 'PAST_DUE':
      return 'bg-red-100 text-red-700'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'bg-gray-200 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

const emptyPagination: PaginationMeta = { page: 1, limit: 10, total: 0, pages: 1 }

const BillingManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('invoices')

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicePagination, setInvoicePagination] = useState<PaginationMeta>(emptyPagination)
  const [invoicePage, setInvoicePage] = useState(1)

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [subscriptionPagination, setSubscriptionPagination] = useState<PaginationMeta>(emptyPagination)

  const [users, setUsers] = useState<User[]>([])
  const [plans, setPlans] = useState<Plan[]>([])

  const [loading, setLoading] = useState(true)

  const [newSubscription, setNewSubscription] = useState({
    userId: '',
    planId: '',
    billingCycle: 'MONTHLY' as BillingCycle
  })

  const [topUp, setTopUp] = useState({ userId: '', amount: '', description: '' })

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchInvoices()
    fetchSubscriptions()
    fetchOptions()
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [invoicePage])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getInvoices({ page: invoicePage, limit: 10 })
      if (response.success && response.data) {
        setInvoices(response.data.invoices)
        setInvoicePagination(response.data.pagination)
      }
    } catch (error) {
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscriptions = async () => {
    try {
      const response = await adminAPI.getSubscriptions({ page: 1, limit: 10 })
      if (response.success && response.data) {
        setSubscriptions(response.data.subscriptions)
        setSubscriptionPagination(response.data.pagination)
      }
    } catch (error) {
      toast.error('Failed to load subscriptions')
    }
  }

  const fetchOptions = async () => {
    try {
      const [usersResponse, plansResponse] = await Promise.all([
        adminAPI.getUsers({ limit: 100 }),
        adminAPI.getPlans()
      ])

      if (usersResponse.success && usersResponse.data) {
        setUsers(usersResponse.data.users)
      }
      if (plansResponse.success && plansResponse.data) {
        setPlans(plansResponse.data)
      }
    } catch (error) {
      toast.error('Failed to load customers and plans')
    }
  }

  const handlePayInvoice = async (invoice: Invoice) => {
    try {
      const response = await adminAPI.payInvoice(invoice.id, { method: 'CASH' })
      if (response.success) {
        toast.success(`Invoice ${invoice.number} settled`)
        fetchInvoices()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to settle invoice')
    }
  }

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newSubscription.userId || !newSubscription.planId) {
      toast.error('Select a customer and a plan')
      return
    }

    try {
      setSubmitting(true)
      const response = await adminAPI.createSubscription(newSubscription)
      if (response.success) {
        toast.success('Subscription created and invoice opened')
        setNewSubscription({ userId: '', planId: '', billingCycle: 'MONTHLY' })
        fetchSubscriptions()
        fetchInvoices()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to create subscription')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelSubscription = async (subscription: Subscription) => {
    if (!confirm(`Cancel subscription for ${subscription.user?.phone ?? subscription.userId}?`)) {
      return
    }

    try {
      await adminAPI.cancelSubscription(subscription.id, true)
      toast.success('Subscription cancelled')
      fetchSubscriptions()
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to cancel subscription')
    }
  }

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = parseFloat(topUp.amount)
    if (!topUp.userId || !amount || amount <= 0) {
      toast.error('Select a customer and enter an amount')
      return
    }

    try {
      setSubmitting(true)
      const response = await adminAPI.topUpWallet({
        userId: topUp.userId,
        amount,
        description: topUp.description || undefined
      })

      if (response.success && response.data) {
        toast.success(`Wallet credited — balance ${formatCurrency(response.data.balanceAfter)}`)
        setTopUp({ userId: '', amount: '', description: '' })
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to top up wallet')
    } finally {
      setSubmitting(false)
    }
  }

  const customerLabel = (user?: Pick<User, 'id' | 'phone' | 'firstName' | 'lastName'>) => {
    if (!user) return '—'
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
    return name ? `${name} (${user.phone})` : user.phone
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
            Billing
          </h1>
          <p className="text-gray-600 mt-1">Invoices, recurring subscriptions and customer wallets</p>
        </div>
        <button
          onClick={() => {
            fetchInvoices()
            fetchSubscriptions()
          }}
          className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl p-2 flex gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Invoices */}
      {activeTab === 'invoices' && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Invoices</h2>
            <span className="text-sm text-gray-500">{invoicePagination.total} total</span>
          </div>

          {loading && invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No invoices yet. Create a subscription to open the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Paid</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Due</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50/60">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{invoice.number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customerLabel(invoice.user)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{formatCurrency(invoice.total)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatCurrency(invoice.amountPaid)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(invoice.dueAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${invoiceStatusClass(invoice.status)}`}>
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {invoice.status !== 'PAID' && (
                          <button
                            onClick={() => handlePayInvoice(invoice)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg hover:from-emerald-600 hover:to-green-700"
                          >
                            Mark paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invoicePagination.pages > 1 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-100">
              <button
                onClick={() => setInvoicePage((page) => Math.max(1, page - 1))}
                disabled={invoicePage <= 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {invoicePagination.page} of {invoicePagination.pages}
              </span>
              <button
                onClick={() => setInvoicePage((page) => Math.min(invoicePagination.pages, page + 1))}
                disabled={invoicePage >= invoicePagination.pages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Subscriptions */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <Plus className="w-4 h-4 mr-2 text-indigo-600" />
              New subscription
            </h2>

            <form onSubmit={handleCreateSubscription} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select
                value={newSubscription.userId}
                onChange={(e) => setNewSubscription({ ...newSubscription, userId: e.target.value })}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select customer…</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {customerLabel(user)}
                  </option>
                ))}
              </select>

              <select
                value={newSubscription.planId}
                onChange={(e) => setNewSubscription({ ...newSubscription, planId: e.target.value })}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select plan…</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatCurrency(plan.price)}
                  </option>
                ))}
              </select>

              <select
                value={newSubscription.billingCycle}
                onChange={(e) =>
                  setNewSubscription({ ...newSubscription, billingCycle: e.target.value as BillingCycle })
                }
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                Create
              </button>
            </form>
          </div>

          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Active subscriptions</h2>
              <span className="text-sm text-gray-500">{subscriptionPagination.total} total</span>
            </div>

            {subscriptions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No subscriptions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/80">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cycle</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period ends</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="hover:bg-gray-50/60">
                        <td className="px-6 py-4 text-sm text-gray-600">{customerLabel(subscription.user)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {subscription.plan?.name ?? '—'}
                          {subscription.plan && (
                            <span className="text-gray-500"> · {formatCurrency(subscription.plan.price)}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">
                          {subscription.billingCycle.toLowerCase()}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{formatDate(subscription.currentPeriodEnd)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${subscriptionStatusClass(subscription.status)}`}>
                            {subscription.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {subscription.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleCancelSubscription(subscription)}
                              className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wallets */}
      {activeTab === 'wallets' && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center">
            <WalletIcon className="w-4 h-4 mr-2 text-indigo-600" />
            Top up a customer wallet
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Credits are applied immediately and can be spent on renewals and invoices.
          </p>

          <form onSubmit={handleTopUp} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={topUp.userId}
              onChange={(e) => setTopUp({ ...topUp, userId: e.target.value })}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select customer…</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {customerLabel(user)}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              step="0.01"
              value={topUp.amount}
              onChange={(e) => setTopUp({ ...topUp, amount: e.target.value })}
              placeholder="Amount (KES)"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />

            <input
              type="text"
              value={topUp.description}
              onChange={(e) => setTopUp({ ...topUp, description: e.target.value })}
              placeholder="Description (optional)"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-600 hover:to-green-700 disabled:opacity-50"
            >
              Credit wallet
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default BillingManagement
