import { IntelligenceBriefing, LivePulse, ModeTiles, SetupChecklist, SuggestedActions } from './content/dashboard-widgets'
import { MarketingKpiRow, ContentCalendar, RecentPosts, PlatformBreakdown, EngagementTrend, TopPost, PostFrequency } from './content/marketing-widgets'
import { EmailClient, ResponseStats, UnreadSummary, PriorityBreakdown } from './content/communications-widgets'
import { FinanceKpiRow, RevenueChart, RecentTransactions, ExpenseBreakdown, CashflowChart, ProfitMargin, RevenueVsExpenses } from './content/finance-widgets'
import { OrderStats, Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct } from './content/commerce-widgets'
import { TrafficChart, EngagementChart, PerformanceTable, TopPages, ConversionStats, BounceRate, ReferralSources } from './content/analytics-widgets'

export const WIDGET_MAP: Record<string, React.ComponentType> = {
  // Dashboard
  'intelligence-briefing': IntelligenceBriefing,
  'live-pulse': LivePulse,
  'mode-tiles': ModeTiles,
  'setup-checklist': SetupChecklist,
  'suggested-actions': SuggestedActions,

  // Marketing
  'mkt-kpi-row': MarketingKpiRow,
  'mkt-content-calendar': ContentCalendar,
  'mkt-recent-posts': RecentPosts,
  'mkt-platform-breakdown': PlatformBreakdown,
  'mkt-engagement-trend': EngagementTrend,
  'mkt-top-post': TopPost,
  'mkt-post-frequency': PostFrequency,

  // Communications
  'comms-email-client': EmailClient,
  'comms-response-stats': ResponseStats,
  'comms-unread-summary': UnreadSummary,
  'comms-priority-breakdown': PriorityBreakdown,

  // Finance
  'fin-kpi-row': FinanceKpiRow,
  'fin-revenue-chart': RevenueChart,
  'fin-recent-transactions': RecentTransactions,
  'fin-expense-breakdown': ExpenseBreakdown,
  'fin-cashflow': CashflowChart,
  'fin-profit-margin': ProfitMargin,
  'fin-revenue-vs-expenses': RevenueVsExpenses,

  // Commerce
  'com-order-stats': OrderStats,
  'com-products': Products,
  'com-orders-kanban': OrdersKanban,
  'com-recent-activity': RecentActivity,
  'com-low-stock': LowStock,
  'com-revenue-by-product': RevenueByProduct,

  // Analytics
  'anl-traffic-chart': TrafficChart,
  'anl-engagement-chart': EngagementChart,
  'anl-performance-table': PerformanceTable,
  'anl-top-pages': TopPages,
  'anl-conversion-stats': ConversionStats,
  'anl-bounce-rate': BounceRate,
  'anl-referral-sources': ReferralSources,
}
