import type { WidgetDefinition } from './types'

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // DASHBOARD
  { id: 'intelligence-briefing', type: 'intelligence-briefing', label: 'Intelligence Briefing', description: 'Daily AI briefing across all modes', size: 'full', mode: 'dashboard' },
  { id: 'live-pulse', type: 'live-pulse', label: 'Live Pulse', description: 'Real-time activity from connected platforms', size: 'full', mode: 'dashboard' },
  { id: 'mode-tiles', type: 'mode-tiles', label: 'Mode Tiles', description: 'Quick access to all five modes', size: 'full', mode: 'dashboard' },
  { id: 'setup-checklist', type: 'setup-checklist', label: 'Setup Checklist', description: 'Track your onboarding progress', size: 'full', mode: 'dashboard' },
  { id: 'suggested-actions', type: 'suggested-actions', label: 'Suggested Actions', description: 'AI-recommended next steps', size: 'full', mode: 'dashboard' },

  // MARKETING
  { id: 'mkt-kpi-row', type: 'mkt-kpi-row', label: 'Marketing KPIs', description: 'Scheduled, published, reach, engagement', size: 'full', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-content-calendar', type: 'mkt-content-calendar', label: 'Content Calendar', description: 'Weekly content calendar with post slots', size: 'full', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-recent-posts', type: 'mkt-recent-posts', label: 'Recent Posts', description: 'Recently published and scheduled posts', size: 'full', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-platform-breakdown', type: 'mkt-platform-breakdown', label: 'Platform Breakdown', description: 'LinkedIn vs Facebook performance split', size: 'half', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-engagement-trend', type: 'mkt-engagement-trend', label: 'Engagement Trend', description: '7-day engagement rate trend line', size: 'half', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-top-post', type: 'mkt-top-post', label: 'Top Post', description: 'Best performing post this month', size: 'half', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'mkt-post-frequency', type: 'mkt-post-frequency', label: 'Post Frequency', description: 'Posts per week over the last 8 weeks', size: 'half', mode: 'marketing', requiredServices: ['linkedin_page', 'facebook_page'] },

  // COMMUNICATIONS
  { id: 'comms-email-client', type: 'comms-email-client', label: 'Email Client', description: 'Full inbox with AI triage and preview', size: 'full', mode: 'communications', requiredServices: ['gmail', 'outlook'] },
  { id: 'comms-response-stats', type: 'comms-response-stats', label: 'Response Stats', description: 'Response rate, avg reply time, thread volume', size: 'full', mode: 'communications', requiredServices: ['gmail', 'outlook'] },
  { id: 'comms-unread-summary', type: 'comms-unread-summary', label: 'Unread Summary', description: 'Unread count breakdown by priority', size: 'half', mode: 'communications', requiredServices: ['gmail', 'outlook'] },
  { id: 'comms-priority-breakdown', type: 'comms-priority-breakdown', label: 'Priority Breakdown', description: 'Donut chart of email priorities', size: 'half', mode: 'communications', requiredServices: ['gmail', 'outlook'] },

  // FINANCE
  { id: 'fin-kpi-row', type: 'fin-kpi-row', label: 'Finance KPIs', description: 'Revenue, expenses, net profit, MRR', size: 'full', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks'] },
  { id: 'fin-revenue-chart', type: 'fin-revenue-chart', label: 'Revenue Chart', description: '8-week revenue trend bar chart', size: 'full', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks'] },
  { id: 'fin-recent-transactions', type: 'fin-recent-transactions', label: 'Recent Transactions', description: 'Latest income and expense entries', size: 'full', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks', 'plaid'] },
  { id: 'fin-expense-breakdown', type: 'fin-expense-breakdown', label: 'Expense Breakdown', description: 'Expense categories donut chart', size: 'half', mode: 'finance', requiredServices: ['quickbooks', 'plaid'] },
  { id: 'fin-cashflow', type: 'fin-cashflow', label: 'Cash Flow', description: 'Monthly cashflow bar chart', size: 'half', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks', 'plaid'] },
  { id: 'fin-profit-margin', type: 'fin-profit-margin', label: 'Profit Margin', description: 'Profit margin trend line', size: 'half', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks'] },
  { id: 'fin-revenue-vs-expenses', type: 'fin-revenue-vs-expenses', label: 'Revenue vs Expenses', description: 'Side-by-side comparison chart', size: 'half', mode: 'finance', requiredServices: ['stripe_account', 'quickbooks'] },

  // COMMERCE
  { id: 'com-products', type: 'com-products', label: 'Products', description: 'Product catalog with placeholder items', size: 'half', mode: 'commerce', requiredServices: ['shopify'] },
  { id: 'com-orders-kanban', type: 'com-orders-kanban', label: 'Orders Kanban', description: 'Orders by status: New, Processing, Shipped', size: 'half', mode: 'commerce', requiredServices: ['shopify'] },
  { id: 'com-recent-activity', type: 'com-recent-activity', label: 'Recent Activity', description: 'Timeline of recent order events', size: 'full', mode: 'commerce', requiredServices: ['shopify'] },
  { id: 'com-order-stats', type: 'com-order-stats', label: 'Order Stats', description: 'Total orders, revenue, fulfillment rate KPIs', size: 'full', mode: 'commerce', requiredServices: ['shopify'] },
  { id: 'com-low-stock', type: 'com-low-stock', label: 'Low Stock', description: 'Products approaching low inventory', size: 'half', mode: 'commerce', requiredServices: ['shopify'] },
  { id: 'com-revenue-by-product', type: 'com-revenue-by-product', label: 'Revenue by Product', description: 'Revenue breakdown by product', size: 'half', mode: 'commerce', requiredServices: ['shopify'] },

  // ANALYTICS
  { id: 'anl-traffic-chart', type: 'anl-traffic-chart', label: 'Traffic Chart', description: 'Website traffic — 7 day bar chart', size: 'half', mode: 'analytics', requiredServices: ['google_analytics'] },
  { id: 'anl-engagement-chart', type: 'anl-engagement-chart', label: 'Engagement Chart', description: 'Social engagement — 7 day bar chart', size: 'half', mode: 'analytics', requiredServices: ['linkedin_page', 'facebook_page'] },
  { id: 'anl-performance-table', type: 'anl-performance-table', label: 'Performance Table', description: 'Key metrics vs prior period', size: 'full', mode: 'analytics', requiredServices: ['google_analytics'] },
  { id: 'anl-top-pages', type: 'anl-top-pages', label: 'Top Pages', description: 'Top 5 pages by views with progress bars', size: 'half', mode: 'analytics', requiredServices: ['google_analytics'] },
  { id: 'anl-conversion-stats', type: 'anl-conversion-stats', label: 'Conversion Stats', description: 'Conversion rate and funnel metrics', size: 'half', mode: 'analytics', requiredServices: ['google_analytics'] },
  { id: 'anl-bounce-rate', type: 'anl-bounce-rate', label: 'Bounce Rate', description: 'Bounce rate trend over 7 days', size: 'half', mode: 'analytics', requiredServices: ['google_analytics'] },
  { id: 'anl-referral-sources', type: 'anl-referral-sources', label: 'Referral Sources', description: 'Traffic sources breakdown bar chart', size: 'full', mode: 'analytics', requiredServices: ['google_analytics'] },
]

export const DEFAULT_LAYOUTS: Record<string, string[]> = {
  dashboard: ['intelligence-briefing', 'mode-tiles', 'setup-checklist', 'suggested-actions'],
  marketing: ['mkt-kpi-row', 'mkt-content-calendar', 'mkt-platform-breakdown', 'mkt-engagement-trend', 'mkt-recent-posts'],
  communications: ['comms-email-client', 'comms-response-stats', 'comms-unread-summary', 'comms-priority-breakdown'],
  finance: ['fin-kpi-row', 'fin-revenue-chart', 'fin-expense-breakdown', 'fin-cashflow', 'fin-recent-transactions'],
  commerce: ['com-order-stats', 'com-products', 'com-orders-kanban', 'com-recent-activity'],
  analytics: ['anl-traffic-chart', 'anl-engagement-chart', 'anl-top-pages', 'anl-conversion-stats', 'anl-performance-table'],
}

export function getWidgetsForMode(modeId: string): WidgetDefinition[] {
  return WIDGET_REGISTRY.filter((w) => w.mode === modeId)
}

export function getWidgetDef(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.type === type)
}
