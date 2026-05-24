/**
 * Normalized commerce data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. `lib/integrations/etsy/normalize.ts`) build a
 * `CommerceSnapshot` from whatever shape the provider returns.
 */

/** Top-of-page KPI tile (the `OrderStats` widget). */
export interface OrderStats {
  totalOrders: number
  newOrders: number
  processingOrders: number
  shippedOrders: number
  /** Display-ready currency string, e.g. "$9,340.00". */
  totalRevenue: string
  /** Display-ready percent string, e.g. "94%". "—" when no orders. */
  fulfillmentRate: string
  /** ISO 4217 currency code, surfaced for future widgets that need it. */
  currencyCode: string
}

export interface Product {
  /** Provider-side identifier. Stringified so widgets stay provider-agnostic. */
  id: string
  name: string
  /** Display-ready price, e.g. "$70.00". */
  price: string
  /** Available units in stock. */
  stock: number
}

export interface OrderCard {
  /** Display id, e.g. "#1847" (prefixed with `#` for parity with the mock). */
  id: string
  /** Display-ready line total, e.g. "$142.00". */
  amount: string
}

export interface OrdersKanban {
  new: OrderCard[]
  processing: OrderCard[]
  shipped: OrderCard[]
}

export type ActivityType = 'order' | 'shipped' | 'alert' | 'processing' | 'refund'

export interface ActivityEntry {
  event: string
  detail: string
  /** Display-ready relative time, e.g. "12 min ago". */
  time: string
  type: ActivityType
}

export interface RevenueByProductEntry {
  name: string
  /** Numeric revenue value in shop currency (already divisor-adjusted). */
  value: number
}

export interface CommerceSnapshot {
  /** When this snapshot was computed (ISO 8601). */
  generatedAt: string
  /** Shop identity — drives the connection chip label. */
  shop: {
    /** Etsy shop_id as a number. */
    shopId: number
    /** Human-readable name (e.g. "MyShop"). */
    shopName: string | null
    /** ISO 4217 currency code. */
    currencyCode: string
  }
  /** Rolling-window tile shown at the top of /commerce. */
  orderStats: OrderStats
  /** Active listings — drives the Products widget. */
  products: Product[]
  /** Receipts grouped by status — drives OrdersKanban. */
  ordersKanban: OrdersKanban
  /** Recent receipt-derived events (newest first) — drives RecentActivity. */
  recentActivity: ActivityEntry[]
  /** Listings below the low-stock threshold — drives LowStock. */
  lowStock: Product[]
  /** Revenue summed per listing within the window — drives RevenueByProduct. */
  revenueByProduct: RevenueByProductEntry[]
}
