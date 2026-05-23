/**
 * Normalized commerce data shape.
 *
 * Widgets read this, never raw provider responses. Provider-specific
 * normalizers (e.g. `lib/integrations/etsy/normalize.ts`) build a
 * `CommerceSnapshot` from whatever shape the provider returns.
 *
 * V1 only populates `orderStats`; the remaining commerce widgets
 * (Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct)
 * continue to read `COMMERCE_MOCK` until Session 12 adds listings + a
 * richer receipt pipeline.
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
}
