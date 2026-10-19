import React, { useState, useEffect } from 'react'
import { Radio, Plus, RefreshCw, Activity, AlertTriangle, Power } from 'lucide-react'
import { adminAPI } from '../services/api'
import { formatDate, formatBytes } from '../utils/formatters'
import toast from 'react-hot-toast'
import type { NasDevice, NasType, NetworkOverview } from '../types'

const severityClass = (severity: string): string => {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-700'
    case 'WARNING':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-sky-100 text-sky-700'
  }
}

const emptyOverview: NetworkOverview = { devices: [], alerts: [], activeSessions: [] }

const NetworkManagement: React.FC = () => {
  const [overview, setOverview] = useState<NetworkOverview>(emptyOverview)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [newDevice, setNewDevice] = useState({
    name: '',
    host: '',
    type: 'MIKROTIK' as NasType,
    apiPort: '8728',
    username: '',
    password: '',
    secret: '',
    location: ''
  })

  useEffect(() => {
    fetchOverview()
  }, [])

  const fetchOverview = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getNetworkOverview()
      if (response.success && response.data) {
        setOverview(response.data)
      }
    } catch (error) {
      toast.error('Failed to load network overview')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newDevice.name || !newDevice.host) {
      toast.error('Name and host are required')
      return
    }

    try {
      setSubmitting(true)
      const response = await adminAPI.createNasDevice({
        name: newDevice.name,
        host: newDevice.host,
        type: newDevice.type,
        apiPort: parseInt(newDevice.apiPort, 10) || 8728,
        username: newDevice.username || undefined,
        password: newDevice.password || undefined,
        secret: newDevice.secret || undefined,
        location: newDevice.location || undefined
      })

      if (response.success) {
        toast.success('Router added')
        setNewDevice({
          name: '',
          host: '',
          type: 'MIKROTIK',
          apiPort: '8728',
          username: '',
          password: '',
          secret: '',
          location: ''
        })
        setShowForm(false)
        fetchOverview()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to add router')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTest = async (device: NasDevice) => {
    try {
      setTestingId(device.id)
      const response = await adminAPI.testNasDevice(device.id)
      if (response.success && response.data) {
        const { reachable, error } = response.data
        if (reachable) {
          toast.success(`${device.name} is reachable`)
        } else {
          toast.error(`${device.name} unreachable${error ? `: ${error}` : ''}`)
        }
        fetchOverview()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Connection test failed')
    } finally {
      setTestingId(null)
    }
  }

  const handleDisconnect = async (sessionId: string, username?: string) => {
    if (!confirm(`Disconnect ${username ?? sessionId} from the network?`)) {
      return
    }

    try {
      const response = await adminAPI.disconnectNasSession(sessionId)
      if (response.success && response.data) {
        toast.success(response.data.message)
        fetchOverview()
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? 'Failed to disconnect session')
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
            Network
          </h1>
          <p className="text-gray-600 mt-1">Routers, live sessions and network health</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add router
          </button>
          <button
            onClick={fetchOverview}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Add router form */}
      {showForm && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <Radio className="w-4 h-4 mr-2 text-indigo-600" />
            Register a router
          </h2>

          <form onSubmit={handleCreateDevice} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              value={newDevice.name}
              onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
              placeholder="Name (e.g. Karen Tower)"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={newDevice.host}
              onChange={(e) => setNewDevice({ ...newDevice, host: e.target.value })}
              placeholder="Host / IP"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={newDevice.type}
              onChange={(e) => setNewDevice({ ...newDevice, type: e.target.value as NasType })}
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="MIKROTIK">MikroTik</option>
              <option value="UBIQUITI">Ubiquiti</option>
              <option value="CISCO">Cisco</option>
              <option value="RADIUS">RADIUS</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              value={newDevice.apiPort}
              onChange={(e) => setNewDevice({ ...newDevice, apiPort: e.target.value })}
              placeholder="API port"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={newDevice.username}
              onChange={(e) => setNewDevice({ ...newDevice, username: e.target.value })}
              placeholder="Username"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={newDevice.password}
              onChange={(e) => setNewDevice({ ...newDevice, password: e.target.value })}
              placeholder="Password"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={newDevice.location}
              onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
              placeholder="Location (optional)"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={newDevice.secret}
              onChange={(e) => setNewDevice({ ...newDevice, secret: e.target.value })}
              placeholder="RADIUS secret (optional)"
              className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
            >
              Save router
            </button>
          </form>
        </div>
      )}

      {/* Alerts */}
      {overview.alerts.length > 0 && (
        <div className="bg-red-50/80 border border-red-100 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-red-800 flex items-center mb-3">
            <AlertTriangle className="w-4 h-4 mr-2" />
            {overview.alerts.length} open alert{overview.alerts.length !== 1 ? 's' : ''}
          </h3>
          <ul className="space-y-2">
            {overview.alerts.map((alert) => (
              <li key={alert.id} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full mr-2 ${severityClass(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <span className="text-gray-800 font-medium">{alert.title}</span>
                  {alert.message && <span className="text-gray-500"> · {alert.message}</span>}
                </div>
                <span className="text-gray-400 whitespace-nowrap">{formatDate(alert.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Devices */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Routers</h2>
          <span className="text-sm text-gray-500">{overview.devices.length} device(s)</span>
        </div>

        {loading && overview.devices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading devices…</div>
        ) : overview.devices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No routers registered yet. Add one to start monitoring the network.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Host</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last seen</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50/60">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{device.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{device.type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.host}:{device.apiPort}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{device.location ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.lastSeenAt ? formatDate(device.lastSeenAt) : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleTest(device)}
                        disabled={testingId === device.id}
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {testingId === device.id ? 'Testing…' : 'Test'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live sessions */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/50 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <Activity className="w-4 h-4 mr-2 text-emerald-600" />
            Live sessions
          </h2>
          <span className="text-sm text-gray-500">{overview.activeSessions.length} online</span>
        </div>

        {overview.activeSessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No active sessions reported by your routers.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Router</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">IP</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">MAC</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Usage</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Uptime</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.activeSessions.map((session) => (
                  <tr key={`${session.deviceId ?? 'nas'}-${session.sessionId}`} className="hover:bg-gray-50/60">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{session.username ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{session.deviceName ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{session.ipAddress ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{session.macAddress ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatBytes(session.bytesIn + session.bytesOut)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{session.uptime ?? '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDisconnect(session.sessionId, session.username)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 rounded-lg hover:from-red-600 hover:to-rose-700"
                      >
                        <Power className="w-3 h-3 mr-1" />
                        Disconnect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default NetworkManagement
