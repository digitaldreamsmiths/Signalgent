export type ServiceId =
  | 'gmail'
  | 'outlook'
  | 'linkedin_page'
  | 'facebook_page'
  | 'shopify'
  | 'stripe_account'
  | 'quickbooks'
  | 'plaid'
  | 'google_analytics'

export interface ServiceDef {
  id: ServiceId
  label: string
  description: string
  mode: 'communications' | 'marketing' | 'finance' | 'commerce' | 'analytics'
  /** Brand hex color */
  color: string
  /** OAuth redirect path — relative, starts with /api/integrations/… */
  connectPath: string
  /** If true, the integration requires a custom input (e.g. Shopify shop domain) */
  requiresInput?: boolean
  /** Placeholder text for the custom input */
  inputPlaceholder?: string
  /** If true, full OAuth flow is not yet implemented */
  comingSoon?: boolean
}

export const SERVICES: ServiceDef[] = [
  // ── Communications ──────────────────────────────────────────────────────────
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Read and triage email threads with AI priority labels',
    mode: 'communications',
    color: '#EA4335',
    connectPath: '/api/integrations/gmail/connect',
  },
  {
    id: 'outlook',
    label: 'Outlook',
    description: 'Microsoft Outlook inbox with AI triage and smart replies',
    mode: 'communications',
    color: '#0078D4',
    connectPath: '/api/integrations/outlook/connect',
  },

  // ── Marketing ───────────────────────────────────────────────────────────────
  {
    id: 'linkedin_page',
    label: 'LinkedIn Page',
    description: 'Schedule posts and pull analytics for your LinkedIn business page',
    mode: 'marketing',
    color: '#0A66C2',
    connectPath: '/api/integrations/linkedin_page/connect',
  },
  {
    id: 'facebook_page',
    label: 'Facebook Page',
    description: 'Manage content and engagement on your Facebook business page',
    mode: 'marketing',
    color: '#1877F2',
    connectPath: '/api/integrations/facebook_page/connect',
  },

  // ── Finance ─────────────────────────────────────────────────────────────────
  {
    id: 'stripe_account',
    label: 'Stripe',
    description: 'Revenue, transactions, and subscription metrics via Stripe Connect',
    mode: 'finance',
    color: '#635BFF',
    connectPath: '/api/integrations/stripe_account/connect',
  },
  {
    id: 'quickbooks',
    label: 'QuickBooks',
    description: 'Expenses, invoices, and P&L from QuickBooks Online',
    mode: 'finance',
    color: '#2CA01C',
    connectPath: '/api/integrations/quickbooks/connect',
  },
  {
    id: 'plaid',
    label: 'Plaid',
    description: 'Connect bank accounts for real-time cashflow data',
    mode: 'finance',
    color: '#000000',
    connectPath: '/api/integrations/plaid/connect',
    comingSoon: true,
  },

  // ── Commerce ─────────────────────────────────────────────────────────────────
  {
    id: 'shopify',
    label: 'Shopify',
    description: 'Products, orders, and inventory from your Shopify store',
    mode: 'commerce',
    color: '#96BF48',
    connectPath: '/api/integrations/shopify/connect',
    requiresInput: true,
    inputPlaceholder: 'your-store.myshopify.com',
  },

  // ── Analytics ───────────────────────────────────────────────────────────────
  {
    id: 'google_analytics',
    label: 'Google Analytics',
    description: 'Traffic, conversions, and audience insights from GA4',
    mode: 'analytics',
    color: '#E8710A',
    connectPath: '/api/integrations/google_analytics/connect',
  },
]

/** Services grouped by mode */
export const SERVICES_BY_MODE = SERVICES.reduce<Record<string, ServiceDef[]>>(
  (acc, s) => {
    if (!acc[s.mode]) acc[s.mode] = []
    acc[s.mode].push(s)
    return acc
  },
  {}
)

export function getServiceDef(id: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id)
}

export function getServicesForMode(mode: string): ServiceDef[] {
  return SERVICES.filter((s) => s.mode === mode)
}

/** Map each service to its required env var names (client ID + secret) */
export const SERVICE_ENV_VARS: Record<ServiceId, { clientId: string; clientSecret: string }> = {
  gmail:            { clientId: 'GOOGLE_CLIENT_ID',      clientSecret: 'GOOGLE_CLIENT_SECRET' },
  google_analytics: { clientId: 'GOOGLE_CLIENT_ID',      clientSecret: 'GOOGLE_CLIENT_SECRET' },
  outlook:          { clientId: 'MICROSOFT_CLIENT_ID',   clientSecret: 'MICROSOFT_CLIENT_SECRET' },
  linkedin_page:    { clientId: 'LINKEDIN_CLIENT_ID',    clientSecret: 'LINKEDIN_CLIENT_SECRET' },
  facebook_page:    { clientId: 'FACEBOOK_APP_ID',       clientSecret: 'FACEBOOK_APP_SECRET' },
  stripe_account:   { clientId: 'STRIPE_CLIENT_ID',      clientSecret: 'STRIPE_CLIENT_SECRET' },
  quickbooks:       { clientId: 'QUICKBOOKS_CLIENT_ID',  clientSecret: 'QUICKBOOKS_CLIENT_SECRET' },
  plaid:            { clientId: 'PLAID_CLIENT_ID',       clientSecret: 'PLAID_SECRET' },
  shopify:          { clientId: 'SHOPIFY_CLIENT_ID',     clientSecret: 'SHOPIFY_CLIENT_SECRET' },
}

/** OAuth authorization URLs per service (standard redirect-based services) */
export const OAUTH_URLS: Partial<Record<ServiceId, string>> = {
  gmail:            'https://accounts.google.com/o/oauth2/v2/auth',
  google_analytics: 'https://accounts.google.com/o/oauth2/v2/auth',
  outlook:          'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  linkedin_page:    'https://www.linkedin.com/oauth/v2/authorization',
  facebook_page:    'https://www.facebook.com/v19.0/dialog/oauth',
  stripe_account:   'https://connect.stripe.com/oauth/authorize',
  quickbooks:       'https://appcenter.intuit.com/connect/oauth2',
}

/** OAuth scopes per service */
export const OAUTH_SCOPES: Partial<Record<ServiceId, string>> = {
  gmail:            'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
  google_analytics: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email',
  outlook:          'offline_access Mail.Read User.Read',
  linkedin_page:    'r_organization_social w_organization_social r_basicprofile',
  facebook_page:    'pages_read_engagement pages_manage_posts pages_show_list',
  stripe_account:   'read_write',
  quickbooks:       'com.intuit.quickbooks.accounting',
}
