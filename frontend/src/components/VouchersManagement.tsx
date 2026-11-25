import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Ticket, Search, Download, X, Check, Clock, AlertCircle } from 'lucide-react'
import { adminAPI } from '../services/api'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'
import type { Plan, Voucher, VoucherStats, VoucherStatus } from '../types'

const STATUS_TABS: { key: VoucherStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unused', label: 'Unused' },
  { key: 'redeemed', label: 'Redeemed' },
  { key: 'expired', label: 'Expired' }
]

const VouchersManagement: React.FC = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [stats, setStats] = useState<VoucherStats | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<VoucherStatus | 'all'>('all')
  const [planFilter, setPlanFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [formData, setFormData] = useState({
    planId: '',
    quantity: '50',
    expiresInDays: '30',
    prefix: ''
  })

  const fetchVouchers = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { page, limit: 20 }
      if (status !== 'all') params.status = status
      if (planFilter) params.planId = planFilter
      if (search.trim()) params.search = search.trim()

      const response = await adminAPI.getVouchers(params as any)
      if (response.success && response.data) {
        setVouchers(response.data.vouchers)
        setPages(response.data.pagination.pages)
        setTotal(response.data.pagination.total)
      }
    } catch (error) {
      toast.error('Failed to load vouchers')
    } finally {
      setLoading(false)
    }
  }, [page, status, planFilter, search])

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getVoucherStats()
      if (response.success && response.data) setStats(response.data)
    } catch (error) {
      /* stats are non-critical */
    }
  }

  const fetchPlans = async () => {
    try {
      const response = await adminAPI.getPlans()
      if (response.success && response.data) setPlans(response.data)
    } catch (error) {
      toast.error('Failed to load plans')
    }
  }

  useEffect(() => {
    fetchVouchers()
  }, [fetchVouchers])

  useEffect(() => {
    fetchStats()
    fetchPlans()
  }, [])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.planId) {
      toast.error('Select a plan')
      return
    }
    setGenerating(true)
    try {
      const response = await adminAPI.createVouchers({
        planId: formData.planId,
        quantity: parseInt(formData.quantity, 10),
        expiresInDays: parseInt(formData.expiresInDays, 10) || undefined,
        prefix: formData.prefix.trim() || undefined
      })
      if (response.success && response.data) {
        toast.success(`${response.data.quantity} vouchers generated`)
        setShowModal(false)
        fetchVouchers()
        fetchStats()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to generate vouchers')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (voucher: Voucher) => {
    if (!confirm(`Delete voucher ${voucher.code}?`)) return
    try {
      const response = await adminAPI.deleteVoucher(voucher.id)
      if (response.success) {
        toast.success('Voucher deleted')
        fetchVouchers()
        fetchStats()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete voucher')
    }
  }

  const handleExportCsv = () => {
    if (vouchers.length === 0) {
      toast.error('Nothing to export')
      return
    }
    const header = 'Code,Plan,Amount,Status,Created,Expires,Redeemed At'
    const rows = vouchers.map(v => [
      v.code,
      v.plan?.name ?? '',
      v.amount ?? '',
      voucherStatus(v),
      formatDate(v.createdAt),
      formatDate(v.expiresAt),
      v.redeemedAt ? formatDate(v.redeemedAt) : ''
    ].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vouchers-${status}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const voucherStatus = (v: Voucher): VoucherStatus => {
    if (v.isRedeemed) return 'redeemed'
    if (new Date(v.expiresAt) <= new Date()) return 'expired'
    return 'unused'
  }

  const statusBadge = (v: Voucher) => {
    const s = voucherStatus(v)
    if (s === 'redeemed') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800">
          <Check className="w-3 h-3 mr-1" /> Redeemed
        </span>
      )
    }
    if (s === 'expired') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" /> Expired
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800">
        <Clock className="w-3 h-3 mr-1" /> Unused
      </span>
    )
  }

  const statCards = [
    { label: 'Total', value: stats?.total ?? 0, gradient: 'from-indigo-500 to-purple-500' },
    { label: 'Unused', value: stats?.unused ?? 0, gradient: 'from-blue-500 to-cyan-500' },
    { label: 'Redeemed', value: stats?.redeemed ?? 0, gradient: 'from-emerald-500 to-green-500' },
    { label: 'Expired', value: stats?.expired ?? 0, gradient: 'from-orange-500 to-red-500' }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">Vouchers</h1>
          <p className="text-gray-600 mt-1">Generate and manage prepaid access codes</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center px-5 py-3 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            Generate Vouchers
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl p-5">
            <div className={`w-10 h-10 bg-gradient-to-br ${card.gradient} rounded-xl flex items-center justify-center mb-3 shadow-lg`}>
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="text-sm text-gray-500 font-medium">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col sm:flex-row gap-4">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setStatus(tab.key); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                status === tab.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="">All plans</option>
          {plans.map(plan => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by code…"
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Voucher table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Expires</th>
                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="h-4 bg-gray-100 rounded"></div>
                    </td>
                  </tr>
                ))
              ) : vouchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <Ticket className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    No vouchers found. Generate your first batch to get started.
                  </td>
                </tr>
              ) : (
                vouchers.map(voucher => (
                  <tr key={voucher.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-bold text-gray-900 tracking-wide">{voucher.code}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{voucher.plan?.name ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {voucher.amount != null ? formatCurrency(voucher.amount) : '—'}
                    </td>
                    <td className="px-6 py-4">{statusBadge(voucher)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(voucher.createdAt)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(voucher.expiresAt)}</td>
                    <td className="px-6 py-4 text-right">
                      {!voucher.isRedeemed && (
                        <button
                          onClick={() => handleDelete(voucher)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete voucher"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">{total} vouchers</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Generate Vouchers</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select
                  required
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a plan…</option>
                  {plans.filter(p => p.isActive).map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatCurrency(plan.price)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="500"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid for (days)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="3650"
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData({ ...formData, expiresInDays: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch prefix <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={8}
                  pattern="[A-Za-z0-9]*"
                  value={formData.prefix}
                  onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
                  placeholder="e.g. KIB"
                />
                <p className="text-xs text-gray-500 mt-1">Codes look like: KIB-XXXX-XXXX-XXXX</p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default VouchersManagement
