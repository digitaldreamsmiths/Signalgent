// MARKETING
export const MARKETING_MOCK = {
  scheduledPosts: 7,
  publishedPosts: 23,
  avgReach: 2847,
  engagementRate: '4.2%',
  platforms: ['LinkedIn', 'Facebook'] as const,
  recentPosts: [
    { platform: 'LinkedIn', preview: 'Excited to announce the launch of Signalgent — the AI command center built for small business owners.', status: 'Published', time: '2h ago' },
    { platform: 'Facebook', preview: 'Running a business means wearing 10 hats. Signalgent helps you wear them better.', status: 'Published', time: 'Yesterday' },
    { platform: 'LinkedIn', preview: '3 things every small business owner should automate in 2026.', status: 'Scheduled', time: 'Tomorrow 10am' },
    { platform: 'Facebook', preview: 'Behind the scenes: how we built our morning briefing AI in 3 weeks.', status: 'Draft', time: '—' },
    { platform: 'LinkedIn', preview: 'Your inbox, your revenue, your social — all in one signal.', status: 'Scheduled', time: 'Fri 2pm' },
  ],
  platformBreakdown: { linkedin: 61, facebook: 39 },
  engagementTrend: [3.1, 3.8, 2.9, 4.5, 3.7, 4.1, 4.2],
  postFrequency: [3, 4, 2, 5, 3, 4, 5, 4],
  topPost: { platform: 'LinkedIn', preview: 'Excited to announce the launch...', reach: 4821, engagement: '7.3%' },
}

// COMMUNICATIONS
export const COMMS_MOCK = {
  emails: [
    { sender: 'Sarah Chen', subject: 'Partnership proposal — follow-up on the Q3 agreement terms', time: '10:42 AM', tag: 'Needs reply', priority: 'urgent' as const },
    { sender: 'Acme Corp', subject: 'Invoice #2847 — payment reminder for outstanding balance', time: '9:15 AM', tag: 'Urgent', priority: 'urgent' as const },
    { sender: 'David Park', subject: 'Re: Q2 strategy deck — attached the revised version with your notes', time: '8:30 AM', tag: 'Opportunity', priority: 'opportunity' as const },
    { sender: 'LinkedIn', subject: 'Your post is getting noticed — engagement is 2x average', time: 'Yesterday', tag: 'Can wait', priority: 'low' as const },
    { sender: 'Stripe', subject: 'Monthly statement — March 2026 processing summary', time: 'Yesterday', tag: 'Can wait', priority: 'low' as const },
    { sender: 'Tom Wilson', subject: 'Re: Supplier contract renewal — confirming the updated terms', time: 'Yesterday', tag: 'Needs reply', priority: 'urgent' as const },
  ],
  totalUnread: 24,
  urgentCount: 3,
  opportunityCount: 5,
  canWaitCount: 16,
  avgResponseTime: '3.2h',
  responseRate: '87%',
  priorityBreakdown: { urgent: 3, opportunity: 5, canWait: 16 },
}

// FINANCE
export const FINANCE_MOCK = {
  revenue30d: '$24,850',
  expenses30d: '$8,320',
  netProfit: '$16,530',
  mrr: '$4,200',
  revenueChange: '+18%',
  expensesChange: '+4%',
  profitChange: '+26%',
  mrrChange: '+12%',
  revenueBars: [14200, 18600, 12800, 22400, 17900, 28100, 21500, 24850],
  cashflowBars: [5800, 9200, 4100, 13600, 9400, 19200, 12300, 16530],
  transactions: [
    { description: 'Stripe payout', category: 'Revenue', amount: '+$6,240', date: 'Apr 13' },
    { description: 'Client payment #1041 — SourceGent Pro', category: 'Revenue', amount: '+$4,800', date: 'Apr 12' },
    { description: 'AWS invoice — March', category: 'Infrastructure', amount: '-$312', date: 'Apr 11' },
    { description: 'Client payment #1040 — Agency plan', category: 'Revenue', amount: '+$3,490', date: 'Apr 10' },
    { description: 'Vercel Pro subscription', category: 'Infrastructure', amount: '-$20', date: 'Apr 9' },
    { description: 'Resend usage — March', category: 'Infrastructure', amount: '-$44', date: 'Apr 8' },
  ],
  expenseBreakdown: [
    { name: 'Infrastructure', value: 42 },
    { name: 'Marketing', value: 28 },
    { name: 'Tools & SaaS', value: 18 },
    { name: 'Other', value: 12 },
  ],
  profitMarginTrend: [52, 58, 55, 62, 60, 64, 66, 66.5],
  revenueVsExpenses: [
    { week: 'W1', revenue: 14200, expenses: 6800 },
    { week: 'W2', revenue: 18600, expenses: 7200 },
    { week: 'W3', revenue: 12800, expenses: 8100 },
    { week: 'W4', revenue: 22400, expenses: 7800 },
    { week: 'W5', revenue: 17900, expenses: 8500 },
    { week: 'W6', revenue: 28100, expenses: 8900 },
    { week: 'W7', revenue: 21500, expenses: 9200 },
    { week: 'W8', revenue: 24850, expenses: 8320 },
  ],
}

// COMMERCE
export const COMMERCE_MOCK = {
  totalOrders: 47,
  newOrders: 12,
  processingOrders: 5,
  shippedOrders: 8,
  totalRevenue: '$9,340',
  fulfillmentRate: '94%',
  products: [
    { name: 'Widget Pro', price: '$70.00', stock: 42 },
    { name: 'Starter Kit', price: '$50.00', stock: 18 },
    { name: 'Premium Bundle', price: '$200.00', stock: 7 },
    { name: 'Accessory Pack', price: '$20.00', stock: 93 },
  ],
  orders: {
    new: [{ id: '#1847', amount: '$142.00' }, { id: '#1846', amount: '$89.50' }, { id: '#1851', amount: '$200.00' }],
    processing: [{ id: '#1845', amount: '$234.00' }, { id: '#1844', amount: '$67.00' }],
    shipped: [{ id: '#1843', amount: '$412.00' }, { id: '#1842', amount: '$50.00' }],
  },
  recentActivity: [
    { event: 'Order #1851 placed', detail: 'Premium Bundle x1', time: '12 min ago', type: 'order' as const },
    { event: 'Order #1847 shipped', detail: 'Tracking: USPS 9400111', time: '1h ago', type: 'shipped' as const },
    { event: 'Low stock alert', detail: 'Premium Bundle — 7 remaining', time: '3h ago', type: 'alert' as const },
    { event: 'Order #1845 processing', detail: 'Widget Pro x2, Accessory Pack x3', time: '5h ago', type: 'processing' as const },
    { event: 'Refund processed', detail: 'Order #1829 — $70.00', time: 'Yesterday', type: 'refund' as const },
  ],
  revenueByProduct: [
    { name: 'Widget Pro', value: 3500 },
    { name: 'Premium Bundle', value: 2800 },
    { name: 'Starter Kit', value: 1900 },
    { name: 'Accessory Pack', value: 1140 },
  ],
}

// ANALYTICS
export const ANALYTICS_MOCK = {
  trafficBars: [
    { day: 'Mon', value: 842 }, { day: 'Tue', value: 1103 }, { day: 'Wed', value: 967 },
    { day: 'Thu', value: 1380 }, { day: 'Fri', value: 1140 }, { day: 'Sat', value: 720 }, { day: 'Sun', value: 1248 },
  ],
  engagementBars: [
    { day: 'Mon', value: 38 }, { day: 'Tue', value: 64 }, { day: 'Wed', value: 51 },
    { day: 'Thu', value: 89 }, { day: 'Fri', value: 44 }, { day: 'Sat', value: 72 }, { day: 'Sun', value: 81 },
  ],
  totalTraffic: '7,400 visits',
  trafficChange: '+14%',
  topPages: [
    { path: '/', views: 2840, pct: 100 },
    { path: '/pricing', views: 1620, pct: 57 },
    { path: '/features', views: 1240, pct: 44 },
    { path: '/docs', views: 890, pct: 31 },
    { path: '/blog', views: 640, pct: 23 },
  ],
  conversionRate: '3.8%',
  conversionChange: '+0.4%',
  bounceRate: '42%',
  avgSession: '2m 14s',
  bounceTrend: [48, 45, 43, 44, 41, 40, 42],
  referralSources: [
    { source: 'Organic search', value: 3200 },
    { source: 'Direct', value: 1840 },
    { source: 'LinkedIn', value: 980 },
    { source: 'Referral', value: 740 },
    { source: 'Facebook', value: 420 },
    { source: 'Other', value: 220 },
  ],
}
