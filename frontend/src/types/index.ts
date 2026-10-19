export interface User {
  id: string
  email?: string
  phone: string
  firstName?: string
  lastName?: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'TECHNICIAN' | 'SUPPORT' | 'AGENT' | 'CUSTOMER'
  organizationId: string
  isActive: boolean
  createdAt: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  email?: string
  phone?: string
  city?: string
  country: string
  currency: string
  taxRate: number
  subscriptionPlan: string
  isActive: boolean
  createdAt: string
}

export interface Plan {
  id: string
  organizationId: string
  name: string
  description?: string
  price: number
  duration: number // in hours
  dataLimit: string
  speedLimit: string
  speedUpload?: string
  speedDownload?: string
  isActive: boolean
  isRecurring: boolean
  setupFee: number
  taxIncluded: boolean
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  userId: string
  planId: string
  organizationId: string
  macAddress?: string
  ipAddress?: string
  nasId?: string
  startTime: string
  endTime?: string
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'SUSPENDED'
  dataUsed: number
  dataLimit?: number
  sessionToken: string
  routerSessionId?: string
  user?: User
  plan?: Plan
}

export interface Payment {
  id: string
  userId: string
  planId: string
  organizationId: string
  invoiceId?: string
  amount: number
  currency: string
  mpesaReceiptNumber?: string
  checkoutRequestId?: string
  paymentMethod: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'REFUNDED'
  transactionId?: string
  phone?: string
  notes?: string
  createdAt: string
  updatedAt: string
  user?: User
  plan?: Plan
}

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'OVERDUE' | 'VOID'
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'

export interface InvoiceItem {
  id: string
  invoiceId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface Invoice {
  id: string
  organizationId: string
  userId: string
  subscriptionId?: string
  number: string
  status: InvoiceStatus
  subtotal: number
  tax: number
  total: number
  amountPaid: number
  currency: string
  issuedAt: string
  dueAt: string
  paidAt?: string
  items?: InvoiceItem[]
  user?: Pick<User, 'id' | 'phone' | 'firstName' | 'lastName'>
  createdAt: string
  updatedAt: string
}

export interface Subscription {
  id: string
  organizationId: string
  userId: string
  planId: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelledAt?: string
  plan?: Pick<Plan, 'id' | 'name' | 'price'>
  user?: Pick<User, 'id' | 'phone' | 'firstName' | 'lastName'>
  createdAt: string
  updatedAt: string
}

export interface Wallet {
  id: string
  organizationId: string
  userId: string
  balance: number
  currency: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface WalletTransaction {
  id: string
  organizationId: string
  walletId: string
  paymentId?: string
  type: 'CREDIT' | 'DEBIT'
  amount: number
  balanceAfter: number
  description?: string
  createdAt: string
}

export interface WalletResponse {
  wallet: Wallet
  transactions: WalletTransaction[]
}

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  totalRevenue: number
  todayRevenue: number
  activeSessions: number
  totalSessions: number
}

export type NasType = 'MIKROTIK' | 'UBIQUITI' | 'CISCO' | 'RADIUS' | 'OTHER'

export interface NasDevice {
  id: string
  organizationId: string
  name: string
  host: string
  type: NasType
  apiPort: number
  username?: string
  isActive: boolean
  lastSeenAt?: string
  location?: string
  createdAt: string
}

export interface NasActiveSessionInfo {
  sessionId: string
  username?: string
  ipAddress?: string
  macAddress?: string
  bytesIn: number
  bytesOut: number
  uptime?: string
  deviceId?: string
  deviceName?: string
}

export interface NetworkAlert {
  id: string
  organizationId: string
  nasDeviceId?: string
  title: string
  message?: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  isResolved: boolean
  resolvedAt?: string
  createdAt: string
}

export interface NetworkOverview {
  devices: NasDevice[]
  alerts: NetworkAlert[]
  activeSessions: NasActiveSessionInfo[]
}

export interface Ticket {
  id: string
  ticketNumber: string
  userId: string
  organizationId: string
  assignedTo?: string
  subject: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  category?: string
  createdAt: string
  updatedAt: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  errors?: Array<{ msg: string; param: string }>
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  pages: number
}

// Admin list endpoints return `{ <resource>: [...], pagination }`
export interface UsersResponse {
  users: User[]
  pagination: PaginationMeta
}

export interface SessionsResponse {
  sessions: Session[]
  pagination: PaginationMeta
}

export interface PaymentsResponse {
  payments: Payment[]
  pagination: PaginationMeta
}

/** Payload accepted by POST/PUT /admin/plans (organizationId comes from the JWT). */
export type PlanInput = Pick<Plan, 'name' | 'price' | 'duration' | 'dataLimit' | 'speedLimit'> &
  Partial<Pick<Plan, 'description' | 'isActive' | 'isRecurring' | 'setupFee' | 'taxIncluded'>>

export interface PaymentRequest {
  phone: string
  planId: string
  amount: number
}

export interface PaymentStatusResponse {
  status: 'pending' | 'completed' | 'failed' | 'timeout'
  sessionToken?: string
  amount?: number
}

export interface ConnectionRequest {
  sessionToken: string
}

export interface AuthState {
  user: User | null
  token: string | null
  organization: Organization | null
  isAuthenticated: boolean
  loading: boolean
}