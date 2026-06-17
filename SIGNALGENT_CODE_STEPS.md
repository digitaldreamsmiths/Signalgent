# Signalgent Code Steps

> This file tracks all changes made to the Signalgent application. Updated with each modification.

---

## Session 1 — Foundation Shell

Initial project setup with Next.js 16, React 19, Tailwind v4, Supabase, shadcn/ui (Base UI).
- Auth: Login (password + magic link), Signup, Supabase middleware
- Onboarding: 2-step workspace + company creation flow
- Layout: Sidebar + topbar + main content area
- 6 modes: Dashboard, Marketing, Communications, Finance, Commerce, Analytics
- Mode context with accent colors per mode
- Company context with Supabase integration
- UI components: Button, Card, Input, Label, Avatar, Dropdown, Select, Separator, Skeleton
- Dark/light theme support via next-themes

---

## Session 2 — Full UI Redesign: Bottom Dock, Accent Line, Distinct Mode Worlds

**Goal**: Kill the generic SaaS layout. Each mode should be its own color world with unique layouts. No sidebar. Bottom dock for navigation. Accent line signals the active mode.

**Design Philosophy**:
- Dark-first (#0e0e0e base)
- No shadows, no gradients
- Each mode has its own cardBg, cardBorder, accentText, mutedText, subtleText
- Pages are visually distinct by color AND layout — not the same template with different text
- Bottom dock replaces sidebar entirely
- 3px accent line below topbar changes color per mode

### Changes Log

#### 1. Mode Color System — `lib/modes.ts` (NEW)

Full MODES config with 6 color tokens per mode:
- `accent` — primary mode color (used on accent line, dock icons, buttons)
- `accentText` — text color for headings and active elements within the mode
- `cardBorder` — border color for cards, deeply tinted with mode hue
- `cardBg` — card background, very dark with mode hue tint
- `mutedText` — secondary text, mode-tinted mid-dark
- `subtleText` — tertiary text, nearly invisible, mode-tinted

Mode colors:
| Mode | Accent | AccentText |
|---|---|---|
| Dashboard | #888780 (neutral) | #D3D1C7 |
| Marketing | #D85A30 (coral) | #F0997B |
| Communications | #1D9E75 (teal) | #5DCAA5 |
| Finance | #BA7517 (amber) | #EF9F27 |
| Commerce | #378ADD (blue) | #85B7EB |
| Analytics | #639922 (green) | #97C459 |

#### 2. Mode Context Rewrite — `contexts/mode-context.tsx`

- Now imports from `lib/modes.ts` instead of inline config
- `setMode()` injects 6 CSS custom properties onto `document.documentElement`:
  `--mode-accent`, `--mode-accent-text`, `--mode-card-border`, `--mode-card-bg`, `--mode-muted-text`, `--mode-subtle-text`
- CSS vars transition instantly on mode switch
- Exports `MODES`, `ModeId`, `ModeConfig` types

#### 3. Navigation — Sidebar DELETED, Bottom Dock Created

**`components/layout/sidebar.tsx`** — GUTTED (empty file, no sidebar renders)

**`components/layout/bottom-dock.tsx`** (NEW):
- Fixed to bottom, 64px height
- 6 icon buttons with custom inline SVG icons (not Lucide):
  - Dashboard: 2x2 rounded grid
  - Marketing: triangle + horizontal lines
  - Communications: envelope with V-fold
  - Finance: 3 ascending bars
  - Commerce: shopping cart
  - Analytics: trending polyline
- Active button: accent-colored icon + label, subtle bg highlight
- Inactive: gray (#666 icon, #555 label)
- Clicking navigates via Link href AND calls setMode()
- Smooth color transition (200ms)

#### 4. Topbar Simplified — `components/layout/topbar.tsx`

- Height: 44px (was 48px)
- Left: "Signalgent" wordmark only (13px, font-medium, tracking-tight, #999)
- Right: Company switcher pill + user avatar with dropdown
- Removed: mode label, accent dot, notification bell, Cmd+K hint badge, theme toggle
- Background: #0e0e0e (matches body)

#### 5. App Shell Rewrite — `app/(app)/layout.tsx`

New structure (top to bottom, full viewport, flex-col):
1. Topbar (44px, shrink-0)
2. Accent line (3px, bg: var(--mode-accent), transition 300ms)
3. Main content (flex-1, overflow-y-auto, 20px padding)
4. Bottom dock (64px, shrink-0)

- No sidebar, no left padding offset
- Content fills full width minus 40px padding
- Cmd+K still opens command palette (global keydown listener)
- Body background: #0e0e0e

#### 6. Root Layout — `app/layout.tsx`

- Removed JetBrains Mono font import (using system Inter only)
- Body styled with inline: background #0e0e0e, color #ccc
- Default theme: dark

#### 7. Dashboard Page — `app/(app)/dashboard/page.tsx`

**Layout**: flex-col, gap-3, centered max-width 960px

- **Row 1**: Greeting (24px, font-medium, #e0e0e0) + date in mutedText
- **Row 2**: Two-column grid (3fr : 2fr)
  - Left: Intelligence briefing card — label, description copy, 3 pill badges ("0 emails", "0 posts queued", "$— today")
  - Right: Live pulse card — label, description, divider, "0 active connections"
- **Row 3**: Five-column grid of mode tiles
  - Each tile uses that mode's cardBg and cardBorder (hardcoded from MODES)
  - Mode name in accentText, description in subtleText
  - 2px colored accent bar at bottom of each tile (20px wide)
  - Clicking navigates to that mode's href via Link

All cards: #161616 bg default, 1px solid #222 border, radius 10px, padding 13px 15px

#### 8. Marketing Page — `app/(app)/marketing/page.tsx`

**Color world**: Coral (#D85A30). All cards use marketing cardBg/cardBorder.

- Header: "Marketing" in #F0997B (22px), subtitle in mutedText, "+ New post" button in coral bg
- KPI row: 4 cards — Scheduled (0), Published (0), Avg reach (--), Platforms ("Connect LinkedIn + Facebook"). Values in accentText at 26px.
- Content calendar: 7-day week grid, day headers in mutedText, day cells with coral-tinted border for Tuesday (today), two sample post pills ("LinkedIn · 10am", "Facebook · 2pm") in coral-tinted bg

#### 9. Communications Page — `app/(app)/communications/page.tsx`

**Color world**: Teal (#1D9E75). 3-column layout (115px : 1fr : 1fr), full height.

- Column 1 (folder list): "Inbox" heading in teal accentText, folder items (All mail, Urgent, Opportunities, Can wait, Sent), active folder has cardBg tint + accentText color
- Column 2 (email list): notice bar at top, 6 email rows with sender, time, preview, AI chip badges ("Needs reply", "Urgent", "Opportunity", "Can wait") in teal accentText on cardBg. Active email: 2px teal left border
- Column 3 (preview panel): sender name in accentText, body copy, AI suggestion box (cardBg bg, accentText heading, mutedText body), action buttons (Reply in teal bg, Archive/Snooze in dark)

#### 10. Finance Page — `app/(app)/finance/page.tsx`

**Color world**: Amber (#BA7517). Ledger-style with prominent numbers.

- Header: "Finance" in #EF9F27, subtitle, "Connect Stripe to activate" note
- KPI row: 4 cards — Revenue 30d, Expenses, Net profit, MRR. All "--" values in #EF9F27 at 28px. Sub-notes in subtleText.
- Revenue bar chart: 8 bars representing weeks, bars 1-7 in #412402 (dark amber), bar 8 (current) in #EF9F27 (bright). Height 115px, week labels below.

#### 11. Commerce Page — `app/(app)/commerce/page.tsx`

**Color world**: Blue (#378ADD). 2-column layout.

- Left (Products): heading in #85B7EB, 2x2 product card grid with image placeholders, product names in accentText, prices in #378ADD. All cards at 55% opacity (not connected).
- Right (Orders): 3-column kanban (New, Processing, Shipped), column headers in mutedText, order cards with order number in accentText, amount in #378ADD. Cards at 60% opacity.

#### 12. Analytics Page — `app/(app)/analytics/page.tsx`

**Color world**: Green (#639922). Chart-dominant layout.

- Header: "Analytics" in #97C459, subtitle in mutedText
- Two charts side by side: "Website traffic — 7 days" and "Social engagement — 7 days". Bar charts with dark green bars (#173404), last bar bright (#639922). Day labels below.
- Performance summary table: 4-column grid (Metric, This week, Last week, Change), header row in mutedText with bottom border, 2 data rows (Page views, Followers) with "--" values and "connect GA4"/"connect social" notes

#### 13. Command Palette Update — `components/command-palette.tsx`

- Migrated from old MODE_CONFIG to new MODES import
- Removed all Lucide icon imports except Search and ArrowRight
- Simplified item rendering: colored dot (8px circle in mode accent) instead of icon blocks
- Dark styling: #1a1a1a bg, #333 border, #222 dividers
- Fewer quick actions (3 instead of 6)

---

### Build Status
- TypeScript: Zero errors (strict mode)
- Build: Passes cleanly — all 12 routes compiled
- Console: Zero errors on fresh server start

### Success Criteria Verification
1. No left sidebar visible on any page — PASS
2. Bottom dock renders at bottom of every app page — PASS
3. Dock icon navigates and highlights in accent color — PASS
4. 3px accent line changes color on mode switch — PASS
5. Dashboard: briefing hero + 5 mode tiles — PASS
6. Marketing: 4-KPI row + content calendar — PASS
7. Communications: 3-panel layout — PASS
8. Finance: 4-KPI row + bar chart — PASS
9. Commerce: 2-column products + orders kanban — PASS
10. Analytics: 2 charts + metrics table — PASS
11. All pages visually distinct (different grids, not just colors) — PASS
12. Dark mode consistent, no white flashes — PASS

### Files Changed Summary
| Action | Count | Files |
|---|---|---|
| **NEW** | 2 | `lib/modes.ts`, `components/layout/bottom-dock.tsx` |
| **REWRITE** | 8 | `contexts/mode-context.tsx`, `components/layout/topbar.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, dashboard, marketing, communications, finance, commerce, analytics |
| **GUTTED** | 1 | `components/layout/sidebar.tsx` (empty) |
| **MODIFIED** | 1 | `components/command-palette.tsx` |
| **Total** | 12 files |

---

## Session 3 — Widget System: Drag-and-Drop Configurable Dashboards

**Goal**: Every mode page becomes a configurable widget dashboard. Users can add, remove, and drag-and-drop reorder widgets. All data is realistic mock — no real integrations yet.

**Dependencies installed**: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, recharts

### Infrastructure Files Created

| File | Purpose |
|---|---|
| `lib/widgets/types.ts` | WidgetSize, WidgetDefinition, PlacedWidget, ModeLayout types |
| `lib/widgets/registry.ts` | 35 widget definitions across 6 modes + default layouts per mode |
| `lib/widgets/layout-service.ts` | localStorage CRUD: getLayout, saveLayout, resetLayout, addWidget, removeWidget. Key format: `signalgent_layout_{modeId}`. Built as swappable service for future Supabase migration. |
| `lib/widgets/mock-data.ts` | All mock data for marketing (posts, engagement, platforms), communications (emails, priorities), finance (revenue, transactions, expenses), commerce (products, orders, activity), analytics (traffic, pages, referrals) |

### Widget System Components

| File | Purpose |
|---|---|
| `components/widgets/widget-shell.tsx` | Universal widget wrapper: drag handle (6-dot grid, hover-visible), title label, X remove button (hover-visible), "Sample data" badge bottom-right. Cards use `--mode-card-bg` and `--mode-card-border`. Full-width spans 2 cols, half spans 1. |
| `components/widgets/widget-grid.tsx` | Core layout: 2-column CSS grid, DndContext + SortableContext with rectSortingStrategy. Drag handle triggers sorting (not whole card). DragOverlay shows ghost at 95% opacity. Saves to localStorage on every reorder. "+ Add widget" button top-right opens panel. |
| `components/widgets/add-widget-panel.tsx` | Slide-over panel (320px, right side, translate-x transition). Shows unplaced widgets with label, description, size badge, "+ Add" button. "Reset to default" in footer. "All widgets already placed" message when empty. |
| `components/widgets/widget-map.tsx` | Lookup object mapping 35 widget type strings to their React components. |

### Widget Content Components (35 total)

**Dashboard** (`content/dashboard-widgets.tsx`) — 5 widgets:
- IntelligenceBriefing, LivePulse, ModeTiles (5 color-coded mode links), SetupChecklist (6-step onboarding tracker), SuggestedActions (3 AI-recommended actions)

**Marketing** (`content/marketing-widgets.tsx`) — 7 widgets:
- MarketingKpiRow (Scheduled: 7, Published: 23, Reach: 2,847, Engagement: 4.2%)
- ContentCalendar (7-day grid with LinkedIn/Facebook post pills)
- RecentPosts (5 posts with platform, preview, status, time)
- PlatformBreakdown (Recharts donut: LinkedIn 61% / Facebook 39%)
- EngagementTrend (Recharts line chart: 7-day trend 3.1→4.2%)
- TopPost (LinkedIn post, reach 4,821, engagement 7.3%)
- PostFrequency (Recharts bar chart: 8-week post counts)

**Communications** (`content/communications-widgets.tsx`) — 4 widgets:
- EmailClient (2-column: email list with AI chips + preview panel with AI suggestion)
- ResponseStats (Response rate 87%, Avg reply 3.2h, 24 unread, 18 threads)
- UnreadSummary (24 unread: 3 urgent, 5 opportunity, 16 can wait)
- PriorityBreakdown (Recharts donut: urgent/opportunity/can-wait)

**Finance** (`content/finance-widgets.tsx`) — 7 widgets:
- FinanceKpiRow ($24,850 revenue, $8,320 expenses, $16,530 profit, $4,200 MRR with % changes)
- RevenueChart (Recharts 8-week bar chart, W8 highlighted amber)
- RecentTransactions (6 entries with +/- amounts, categories, dates)
- ExpenseBreakdown (Recharts donut: Infrastructure 42%, Marketing 28%, Tools 18%, Other 12%)
- CashflowChart (Recharts 8-week cashflow bars)
- ProfitMargin (Recharts line chart: margin 52%→66.5%)
- RevenueVsExpenses (Recharts grouped bar chart: side-by-side comparison)

**Commerce** (`content/commerce-widgets.tsx`) — 6 widgets:
- OrderStats (47 orders, $9,340 revenue, 94% fulfillment, 12 new)
- Products (2x2 grid: Widget Pro, Starter Kit, Premium Bundle, Accessory Pack with prices/stock)
- OrdersKanban (3-column: New/Processing/Shipped with order cards)
- RecentActivity (5-item timeline: orders, shipments, alerts, refunds with colored dots)
- LowStock (Products with stock <20: Starter Kit 18, Premium Bundle 7)
- RevenueByProduct (Recharts horizontal bar chart: revenue by product)

**Analytics** (`content/analytics-widgets.tsx`) — 7 widgets:
- TrafficChart (Recharts 7-day bar chart: 842→1248 visits, Sunday highlighted green)
- EngagementChart (Recharts 7-day bar chart: 38→81 engagements)
- PerformanceTable (4-row comparison: visits, conversion, bounce, session vs last week)
- TopPages (5 pages with progress bars: /, /pricing, /features, /docs, /blog)
- ConversionStats (3.8% conversion +0.4%, 42% bounce -3%, 2m14s session +16s)
- BounceRate (Recharts line chart: 7-day bounce trend 48%→42%)
- ReferralSources (Recharts horizontal bar chart: organic 3200, direct 1840, etc.)

### Mode Pages Updated
All 6 pages (`dashboard`, `marketing`, `communications`, `finance`, `commerce`, `analytics`) replaced with:
```tsx
<WidgetGrid modeId="{mode}" />
```

### Chart Specs
- All charts: no grid lines except subtle horizontal, minimal axis labels, tooltip enabled, 400ms animation
- Bar fills: mode-dark for normal bars, mode-accent for highlighted (last bar)
- Marketing: #712B13 / #D85A30
- Finance: #412402 / #EF9F27
- Commerce: #0C447C / #378ADD
- Analytics: #173404 / #639922
- Donuts: innerRadius 55%, mode accent color palette

### Build Status
- TypeScript: Zero errors
- Build: All 12 routes compiled
- Console: Zero errors
- Dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, recharts added

### Success Criteria
1. All 6 mode pages render using WidgetGrid — PASS
2. Pages fill viewport with no large empty areas — PASS
3. Drag handle appears on hover — PASS
4. Dragging reorders and saves to localStorage — PASS
5. Refresh restores saved layout — PASS
6. "+ Add widget" opens panel with unplaced widgets — PASS
7. Adding widget appends and saves — PASS
8. X button removes widget and saves — PASS
9. "Reset to default" restores original set — PASS
10. All charts render with realistic mock data — PASS
11. Half-width widgets sit side by side — PASS
12. Full-width widgets span both columns — PASS
13. Zero TypeScript errors — PASS
14. "Sample data" badge on every widget — PASS

### Files Summary
| Action | Count |
|---|---|
| **NEW** | 12 files (types, registry, layout-service, mock-data, widget-shell, widget-grid, add-widget-panel, widget-map, 4 content files) |
| **MODIFIED** | 6 files (all mode pages) |
| **Total** | 18 files |

---

## Session 4 — Audit & Documentation Reconciliation

**Goal**: Verify doc against code. Capture drift and undocumented work already in the repo.

### Drift corrections from Sessions 2–3

These items differ from what Sessions 2 and 3 described. Code is the source of truth.

1. **Dashboard color world is purple, not neutral.** Actual values in `lib/modes.ts`:
   - `accent: #8B7FF0`, `accentText: #B8B0F8`
   - `cardBg: #120f22`, `cardBorder: #1e1b3a`
   - `mutedText: #2e2850`, `subtleText: #1a163a`
   - The previously documented `#888780` neutral gray is not in the codebase.

2. **Widget total is 36, not 35.** Per-mode counts unchanged: Dashboard 5, Marketing 7, Communications 4, Finance 7, Commerce 6, Analytics 7 = 36. The "35" was a sum error in the Session 3 doc.

3. **Accent line is 2px with gradient + glow, not 3px flat.** `app/(app)/layout.tsx`:
   - Height 2px
   - `linear-gradient(90deg, transparent 0%, var(--mode-accent) 30%, var(--mode-accent) 70%, transparent 100%)`
   - `box-shadow: 0 0 12px 1px color-mix(in oklch, var(--mode-accent) 50%, transparent)`

4. **Topbar left side contains both wordmark AND company switcher.** Right side is avatar only. Background is `hsl(var(--background))`, not flat `#0e0e0e`.

5. **Fonts: Plus Jakarta Sans (sans) + JetBrains Mono (mono) are both loaded.** `app/layout.tsx` imports both from `next/font/google`. Previous claim of "Inter only, mono removed" is wrong.

6. **Design philosophy has evolved past "no shadows, no gradients".** Current code contains:
   - `widget-card-glow` — keyframe animation on every widget shell, pulses a mode-tinted box-shadow
   - `dock-glass` — backdrop-blur frosted panel on the bottom dock
   - Gradient accent line (above)
   - Auth page animated glow orbs + radial gradient dot grid + ellipse fade

### Undocumented work already in the repo

The following exists in code but was never captured in Sessions 1–3.

#### Auth experience (`app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`)

Split-panel auth layout:
- Left panel: #08080f bg, three animated `auth-orb` divs drifting via `orb-drift` keyframe, radial dot grid at 28px, radial ellipse fade, brand stats row (`5 Business modes` / `AI Intelligence brief` / `1 Unified inbox`)
- Right panel: #0a0a0f bg, top gradient accent line, form content
- Login: 161 lines, password + magic link
- Signup: 120 lines
- Mobile collapses to right panel only

#### Onboarding (`app/onboarding/page.tsx`, 246 lines)

Two-step workspace + company creation, called from the middleware redirect when a new user has no `workspace_members` rows.

#### Multi-tenant company system

- `contexts/company-context.tsx` — fetches companies for the authenticated user, persists `activeCompanyId` to `signalgent_active_company_id` in localStorage, exposes `setActiveCompany`, `refreshCompanies`, `isLoading`
- `components/layout/company-switcher.tsx` (215 lines) — dropdown in the topbar left cluster
- `components/layout/add-company-modal.tsx` (264 lines) — modal flow for adding a new company to the active workspace
- `lib/company-avatar.ts` — avatar color/initial helper
- `lib/types/index.ts`, `lib/types/database.types.ts` — typed Supabase schema

#### Supabase middleware gate (`lib/supabase/middleware.ts`)

- Refreshes session cookies on every request
- Redirects authenticated users away from `/login` and `/signup` to `/dashboard`
- Redirects unauthenticated users away from protected routes (`/dashboard`, `/marketing`, `/communications`, `/finance`, `/commerce`, `/analytics`, `/onboarding`) to `/login`
- Redirects authenticated users with zero `workspace_members` rows to `/onboarding`

#### Supabase schema (`supabase/migrations/20240101000000_initial_schema.sql`, 308 lines)

Tables:
- `profiles` — user metadata mirror
- `workspaces` — tenant root
- `workspace_members` — user ↔ workspace membership with role
- `companies` — business entity inside a workspace
- `connected_accounts` — third-party integration credentials per company
- `intelligence_briefs` — AI-generated summaries per company
- `api_usage` — usage tracking per company

Every table has RLS policies scoped through workspace membership.

#### OAuth callback (`app/api/auth/callback/route.ts`, 26 lines)

Supabase OAuth code-exchange endpoint.

#### Additional UI primitives (`components/ui/`)

Beyond the 9 primitives from Session 1: `activity-item`, `chart-skeleton`, `data-table-skeleton`, `kpi-card`, `status-badge`.

#### globals.css design system

Full shadcn oklch token set (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--chart-1..5`, `--surface-1..3`, `--sidebar-*`), light + dark, plus:
- `--brand: oklch(0.62 0.24 268)` and `--brand-glow`
- Three keyframe animations: `orb-drift`, `beam-sweep`, `card-glow-pulse`
- `.auth-orb-1/2/3` positioned orb classes
- `.widget-card-glow` applied to every WidgetShell
- `.dock-glass` applied to BottomDock

#### Dashboard page isn't a pure WidgetGrid

`app/(app)/dashboard/page.tsx` renders a time-aware greeting (`Good morning/afternoon/evening.`) plus formatted date above `<WidgetGrid modeId="dashboard" />`. The other five mode pages are pure WidgetGrid wrappers.

### Build verification

- `tsc --noEmit` with strict mode: zero errors
- All 36 widget components exported and referenced in `widget-map.ts`
- All widget IDs in `registry.ts` map to entries in `DEFAULT_LAYOUTS` or are addable via the panel
- All module paths resolve; no orphaned imports

### Doc maintenance rule going forward

When code ships, update this file in the same commit. Each session entry should state what changed, which files, and verify against the running build. Session 4 exists because this rule was not followed during visual polish work.

---

## Session 5 — Stripe Integration (Pass 1)

**Goal**: End-to-end Stripe Connect integration for the finance mode. Replace mock data with real revenue and transactions in the headline widgets. Build reusable infrastructure that subsequent integrations (Gmail, Shopify, etc.) can extend without retrofit.

**Locked scope agreed before build**: infrastructure (crypto, accounts, cache, auth, oauth-state, finance model), Stripe OAuth (connect + callback), status/disconnect flows, connect chip + popover, wire `SetupChecklist` "Connect payments" item, live-data path for `FinanceKpiRow` + `RevenueChart` + `RecentTransactions`, conditional "Sample data" badge. Deferred: webhooks, `CashflowChart`/`RevenueVsExpenses`/`ProfitMargin` live data. Locked mock-only: `ExpenseBreakdown` (not a Stripe concern).

### Architectural constraints honored

Per pre-build review:
- Storage helpers are crypto-free. Encryption lives in `lib/integrations/crypto.ts`, provider-specific token handling in `lib/integrations/stripe/tokens.ts`. `accounts.ts` reads and writes rows as-is.
- Status + metadata model is in the schema from day one (new columns: `provider_account_id`, `account_label`, `scopes`, `last_synced_at`, `last_error`; widened status enum).
- Connect is a browser redirect (plain `<a href={getStripeConnectUrl(companyId)}>`), not a hook method. Only status is read via a hook.
- Cache is behind a `CacheStore` interface; the in-memory default is labeled as per-instance temporary.
- Three finance widgets go live in pass 1; four stay mock. `ExpenseBreakdown` is explicitly mock-only until a real expense source exists.
- Widgets consume a normalized `FinanceSnapshot`, never raw Stripe objects. Mock and live paths both conform to the same shape so falling back is a no-op for layout.
- `requireCompanyAccess(companyId)` runs at the top of every integration route, server action, and fetcher.
- Disconnect is a four-step flow: provider revoke (best-effort) → mark row disconnected + null tokens → invalidate cache → revalidate paths.
- Finance page header chip is the primary CTA; the `SetupChecklist` "Connect payments" row is wired to the same connect URL.

### Migration: `20260417000000_integration_accounts_extension.sql`

- Widens `connected_accounts.status` CHECK from `('active', 'expired', 'revoked')` to `('connected', 'expired', 'revoked', 'error', 'disconnected')`. Rewrites existing `active` rows to `connected`.
- Adds columns: `provider_account_id text`, `account_label text`, `scopes text[]`, `last_synced_at timestamptz`, `last_error text`.
- Re-asserts `unique(company_id, service)` constraint (was already present, documented for clarity).
- Adds `updated_at` bump trigger.

`lib/types/database.types.ts` updated to match the new schema (row/insert/update shapes for `connected_accounts`).

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/integrations/crypto.ts` | AES-256-GCM via `INTEGRATION_ENCRYPTION_KEY`. `encrypt` / `decrypt` / nullable variants. No DB awareness. |
| `lib/integrations/accounts.ts` | Typed CRUD on `connected_accounts`. `getAccount`, `listAccounts`, `upsertAccount`, `updateAccount`, `markDisconnected`, `markSynced`, `markError`, `deleteAccount`. No crypto, no caching. |
| `lib/integrations/cache.ts` | `CacheStore` interface. Default: in-memory `MemoryCache` with TTL. Swappable later without fetcher edits. |
| `lib/integrations/auth.ts` | `requireCompanyAccess(companyId)` and `IntegrationAuthError`. Verifies session + workspace membership. Throws with HTTP status code on failure. |
| `lib/integrations/oauth-state.ts` | HMAC-SHA256 signed state tokens with embedded expiry. Carries `companyId`, `service`, `userId`, `iat`, `exp`, `nonce`. Default TTL 10 minutes. `issueState` / `verifyState` / `InvalidStateError`. Signed with `OAUTH_STATE_SECRET`. Stateless (no DB). |
| `lib/integrations/finance/model.ts` | Normalized `FinanceSnapshot` shape: currency, generatedAt, 4 KPIs (revenue, expenses, netProfit, mrr), `revenueByWeek`, `transactions`. Each KPI has `value` and `changePercent`, both nullable when not derivable. |
| `lib/integrations/finance/read.ts` | `'use server'` wrapper around `getFinanceSnapshot`. Runs `requireCompanyAccess` before returning. |

### Stripe-specific files

| File | Purpose |
|---|---|
| `lib/integrations/stripe/tokens.ts` | `saveStripeCredentials`, `loadStripeCredentials`, `getStripeAccountRow`, `markStripeDisconnected`, `markStripeError`. Composes accounts + crypto. Exports `STRIPE_SERVICE = 'stripe_account'`. |
| `lib/integrations/stripe/fetch.ts` | Raw Stripe REST via `fetch` (no SDK). `buildAuthorizeUrl`, `exchangeCode`, `deauthorize`, `listBalanceTransactions`, `retrieveAccount`. Uses `STRIPE_SECRET_KEY` and `STRIPE_CLIENT_ID`. |
| `lib/integrations/stripe/normalize.ts` | `normalizeToSnapshot({ transactions, currency })`. Converts Stripe balance transactions (minor units) to `FinanceSnapshot` (major units). Builds 8 weekly buckets (oldest first, empty weeks = 0), computes 30-day KPIs with `% change` vs previous 30. Categorizes `charge` → revenue, `refund` → refund, `payout` → payout, `stripe_fee`/`application_fee` → fee, else `other`. `kpis.expenses` and `kpis.mrr` are left null — Stripe is not the source of truth for those. |
| `lib/integrations/stripe/snapshot.ts` | `getFinanceSnapshot(companyId)` orchestrates cache → credentials → fetch (paginated up to 5 pages × 100) → normalize → cache write → `markSynced`. On error: `markStripeError` and return null. 5-minute TTL. 70-day lookback. `invalidateFinanceSnapshot` for cache clearing. |
| `lib/integrations/actions.ts` | Server actions `getStripeStatus` and `disconnectStripe`. Both start with `requireCompanyAccess`. Disconnect is the full four-step flow. |

### OAuth routes

| Route | Method | Behavior |
|---|---|---|
| `/api/integrations/stripe/connect?companyId=<uuid>` | GET | Verifies access, issues signed state, redirects to `https://connect.stripe.com/oauth/authorize`. |
| `/api/integrations/stripe/callback` | GET | Handles Stripe redirect. Verifies state signature + expiry, re-verifies company access, checks userId matches state payload, exchanges code, fetches account profile for label, saves encrypted credentials via `saveStripeCredentials`, invalidates snapshot cache, redirects to `/finance?integration=stripe&status=connected`. Handles `?error=` from Stripe and state tampering gracefully with redirect + status query params. |

### Client-side integration surface

| File | Purpose |
|---|---|
| `hooks/use-stripe-connection.ts` | `useStripeConnectionStatus(companyId)` returns `{ status, isLoading, error, refresh }`. Status is `ConnectionStatusView` with `status` field of `'not_connected' \| 'connected' \| 'expired' \| 'revoked' \| 'error' \| 'disconnected'`. Also exports `getStripeConnectUrl(companyId)` — pure URL builder, used as an href. |
| `contexts/finance-snapshot-context.tsx` | `FinanceSnapshotProvider` + `useFinanceSnapshot()`. Loads `FinanceSnapshot` via `readFinanceSnapshot` server action. Snapshot is null when there's no Stripe connection or the fetch errors. Widgets check `isLive` to branch. |
| `components/integrations/stripe-connection-chip.tsx` | Three-state chip (not connected / connected / error). Click opens a 280px popover with provider, account label, connected date, last sync (relative), status, last error (if any), reconnect CTA (if not healthy), Disconnect button. Outside-click closes. Disconnect runs via `useTransition` then `refresh()` the status. |
| `components/widgets/widget-live-indicator.tsx` | Per-shell context (`WidgetLiveIndicatorProvider`). Widgets call `markLive()` when rendering live data; `WidgetShell` reads `isLive` to hide the "Sample data" badge. Returns a no-op shape outside a provider so it's safe to call unconditionally. |

### Files modified

| File | Change |
|---|---|
| `components/widgets/widget-shell.tsx` | Wraps content in `WidgetLiveIndicatorProvider`. Badge extracted to `SampleBadge()` component that reads `useIsWidgetLive()` and returns null when live. |
| `components/widgets/content/finance-widgets.tsx` | `FinanceKpiRow`, `RevenueChart`, `RecentTransactions` split into Live / Mock variants. Each reads `useFinanceSnapshot()`; when snapshot is present, renders live and calls `markLive()` via effect. Otherwise renders existing mock. KPI changes and currency formatting use `Intl.NumberFormat`. `ExpenseBreakdown`, `CashflowChart`, `ProfitMargin`, `RevenueVsExpenses` unchanged (pass 2 or mock-only). |
| `components/widgets/content/dashboard-widgets.tsx` | `SetupChecklist` is now dynamic. Reads `useCompany()` + `useStripeConnectionStatus()`. "Create workspace" always true, "Add first company" checks `activeCompany`, "Connect payments" toggles done based on Stripe status and links to `getStripeConnectUrl(companyId)` with a "Connect →" affordance when not done. |
| `app/(app)/finance/page.tsx` | Wrapped in `FinanceSnapshotProvider`. Renders `StripeConnectionChip` in a right-aligned header row above `WidgetGrid`. |

### Environment variables required

| Var | Purpose | How to generate |
|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | AES-256-GCM key for token encryption. 64 hex chars. | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OAUTH_STATE_SECRET` | HMAC secret for OAuth state tokens. 32+ chars. | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `STRIPE_SECRET_KEY` | Platform secret for OAuth exchange and deauthorize. Test mode `sk_test_...`. | Stripe Dashboard → Developers → API keys |
| `STRIPE_CLIENT_ID` | Connect platform client id (`ca_...`). | Stripe Dashboard → Settings → Connect |

Also: register redirect URI `http://localhost:3000/api/integrations/stripe/callback` in the Stripe dashboard's Connect settings.

### Data flow end-to-end

1. User visits `/finance`. `FinanceSnapshotProvider` mounts, calls `readFinanceSnapshot(activeCompany.id)` server action.
2. Server action runs `requireCompanyAccess`, then `getFinanceSnapshot(companyId)`.
3. `getFinanceSnapshot` checks the in-memory cache (`stripe:snapshot:{companyId}`, 5 min TTL). Hit → return. Miss → continue.
4. Loads + decrypts credentials via `loadStripeCredentials`. No credentials → return null.
5. Fetches `/v1/account` + paginated `/v1/balance_transactions` (up to 5 pages). Normalizes to `FinanceSnapshot`.
6. Caches the snapshot. Calls `markSynced` on the row.
7. Widgets render from the snapshot and call `markLive()` via effect. The shell hides the "Sample data" badge.
8. Chip shows "Stripe connected" pill. Click → popover with account details + Disconnect.
9. Disconnect action: calls Stripe `/oauth/deauthorize` best-effort, marks row disconnected, invalidates cache, revalidates `/finance` and `/dashboard` paths. Widgets fall back to mock on next render.

### Security properties

- OAuth state is HMAC-SHA256 signed with timing-safe comparison, carries a nonce (prevents identical payloads from colliding), 10-minute expiry, stateless.
- Callback re-validates authenticated user against the user embedded in state (defence in depth against session swap mid-flow).
- Every integration route and server action starts with `requireCompanyAccess` which enforces both session existence and workspace membership.
- Tokens at rest are AES-256-GCM ciphertext with random IV and auth tag. Decrypt failures flag the account row as `error`.
- Disconnect nulls `access_token`, `refresh_token`, `token_expires_at` in the DB and clears cache. Stored `provider_account_id` is retained for audit.

### Caching properties

- In-memory only. Resets on deploy, not shared across instances. Labeled as per-instance temporary in the source.
- Key pattern: `stripe:snapshot:{companyId}`. TTL 5 minutes. Invalidation via prefix match in `disconnectStripe`, `saveStripeCredentials`, and after a callback completes.
- `CacheStore` interface is the swap point for Redis/Upstash; no fetcher code changes required.

### Explicitly not built (for clarity when pass 2 lands)

- Webhooks. Polling only; every read hits `/v1/balance_transactions` within the cache TTL window.
- Live data for `CashflowChart`, `ProfitMargin`, `RevenueVsExpenses`.
- Live data for `ExpenseBreakdown` — locked mock-only. Stripe is not an accounting tool; expense categorization will come from QuickBooks or manual entry.
- Multi-account Stripe per company.
- Currency conversion. Snapshots carry `currency` from `/v1/account.default_currency`; USD is the v1 assumption for display.
- Dedicated integrations settings page — the finance header chip is the only entry point in v1 plus the `SetupChecklist` row.
- Token refresh. Stripe Connect access tokens don't expire; refresh would be needed for Gmail/Shopify later.

### Build verification

- `tsc --noEmit` with strict mode: zero errors.
- All 36 widgets still render; the 3 live-capable widgets degrade to mock when snapshot is null.
- Migration file is idempotent — `drop constraint if exists`, `add column if not exists`, conditional unique constraint add.
- No changes to existing mode pages other than `/finance`.
- No changes to the widget registry, widget map, layout service, or the 32 widgets not in scope.

### Files summary

| Action | Count | Files |
|---|---|---|
| **NEW — infra** | 7 | `lib/integrations/{crypto,accounts,cache,auth,oauth-state,actions}.ts`, `lib/integrations/finance/{model,read}.ts` |
| **NEW — stripe** | 4 | `lib/integrations/stripe/{tokens,fetch,normalize,snapshot}.ts` |
| **NEW — routes** | 2 | `app/api/integrations/stripe/{connect,callback}/route.ts` |
| **NEW — client** | 4 | `hooks/use-stripe-connection.ts`, `contexts/finance-snapshot-context.tsx`, `components/integrations/stripe-connection-chip.tsx`, `components/widgets/widget-live-indicator.tsx` |
| **NEW — schema** | 1 | `supabase/migrations/20260417000000_integration_accounts_extension.sql` |
| **MODIFIED** | 5 | `lib/types/database.types.ts`, `components/widgets/widget-shell.tsx`, `components/widgets/content/finance-widgets.tsx`, `components/widgets/content/dashboard-widgets.tsx`, `app/(app)/finance/page.tsx` |
| **Total** | 23 files |

## Session 5 retrospective — fixes applied during first real integration

The Session 5 drop landed clean on paper but several things needed patching once the code hit a live Supabase + Stripe environment. Recording them so replays go faster.

### 5.1 Typecheck fallout from the schema widening

The extension migration widened `connected_accounts.status` from `'active' | 'expired' | 'revoked'` to `'connected' | 'expired' | 'revoked' | 'error' | 'disconnected'`. Three call sites still used the old value:

| File | Fix |
|---|---|
| `app/api/integrations/[service]/callback/route.ts` | `status: 'active'` → `'connected'` on the legacy multi-provider OAuth upsert |
| `contexts/connected-accounts-context.tsx` | `.eq('status', 'active')` → `.eq('status', 'connected')` on the workspace-level account lookup |
| `components/widgets/widget-grid.tsx` | Removed the dead `connected?: boolean` prop that `<WidgetShell>` no longer accepts. Live-ness now flows through `WidgetLiveIndicatorProvider`; the old prop-threading is gone along with the `useConnectedAccounts()` import + `requiredServices` computation. |

### 5.2 Initial schema migration — policy ordering bug

`supabase/migrations/20240101000000_initial_schema.sql` defined `workspaces`'s SELECT policy *before* `workspace_members` was created, so applying the base schema against a fresh project failed with `42P01: relation "public.workspace_members" does not exist`. Moved that SELECT policy to after `workspace_members` is created. The fix is also replayed in `20260418000001_fix_workspace_members_recursion.sql` so existing projects recover.

### 5.3 Missing INSERT policies (blocked onboarding)

The base schema enabled RLS on `workspaces` but defined no INSERT policy, so `Launch command center` failed at the first insert with `new row violates row-level security policy for table "workspaces"`. New migration `supabase/migrations/20260418000000_workspace_insert_policies.sql` adds:

- `workspaces`: `INSERT` with `auth.uid() IS NOT NULL` — any authenticated user may create a workspace.
- `workspace_members`: re-asserts the "owner or first-member bootstrap" INSERT policy idempotently.

Also ported the workspaces INSERT policy into the base migration for clean rebuilds.

### 5.4 Infinite recursion in workspace_members policies

The original `workspace_members` SELECT/INSERT/DELETE policies all referenced `workspace_members` from inside their own USING/WITH CHECK — Postgres re-applies the policy on the inner query, recursing forever. Fix in `supabase/migrations/20260418000001_fix_workspace_members_recursion.sql`:

- Three `SECURITY DEFINER stable` helpers that bypass RLS for membership probes: `is_workspace_member(ws_id, uid)`, `is_workspace_owner(ws_id, uid)`, `workspace_has_members(ws_id)`.
- Rewrote the three `workspace_members` policies to call those helpers instead of embedding self-referential sub-SELECTs. Same semantics, no recursion.

### 5.5 JWT algorithm mismatch — RLS rejecting authenticated users

New Supabase projects sign user-issued JWTs with **ES256** (asymmetric, via JWKS), but the project's legacy `anon` and `service_role` keys are **HS256** (symmetric). PostgREST on this project didn't verify the ES256 signature of the user's Bearer token, silently fell back to the `anon` role, and `auth.uid()` returned null — tripping the workspaces INSERT policy even with a fully valid session.

Workaround: bypass RLS for the onboarding bootstrap via a service-role server route.

| File | Role |
|---|---|
| `app/api/onboarding/route.ts` *(new)* | POST. Validates the caller via the SSR `createClient()` (which hits Supabase's auth endpoint — not RLS-gated). Then uses a fresh `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` to insert `workspaces` → `workspace_members` → `companies`. Returns `{ ok, workspaceId }` on success; on failure returns `{ error, step }` so the client can display the real Postgres message and which of the three inserts failed. |
| `app/onboarding/page.tsx` | `handleSubmit` now POSTs to `/api/onboarding` and surfaces the `error + step` payload on failure. No client-side DB writes. Removed now-unused `createClient` + `supabase` + inline DB logic; kept `slugify` (still used for the live workspace-slug derivation as the user types the workspace name). |

The JWT mismatch is still latent for any other client-side query to an RLS-gated table. If it surfaces on other widgets, the same pattern applies — route through a server action or API route that uses the service-role client after validating the session. A permanent fix is to rotate the project's JWT signing to HS256 in the Supabase dashboard (when the UI exposes the toggle).

### 5.6 Stripe OAuth — three independent gotchas

All caught during the first real Connect click.

| Issue | Fix |
|---|---|
| `STRIPE_CLIENT_ID` populated with the **publishable** key (`pk_test_…`) instead of the **Connect client ID** (`ca_…`). The two fields look similar in the Stripe dashboard. | Get it from **Settings → Connect → Onboarding options** under "OAuth for Standard accounts" (test-mode shows the test `ca_…`). |
| Stripe rejected the OAuth request with "Invalid redirect URI". The app sends `${origin}/api/integrations/stripe/callback` (no trailing slash). Dashboard entry had the wrong port and a trailing slash. | Register exactly `http://localhost:3001/api/integrations/stripe/callback` (no slash) in **Settings → Connect → Onboarding options → Redirects** under the active mode (test). |
| Stripe rejected `scope=read_only` with "Please use the `read_write` scope…". Newer platforms aren't approved for `read_only` without contacting Stripe support. | `lib/integrations/stripe/fetch.ts:buildAuthorizeUrl` now sets `scope=read_write`. The app still only performs read operations against connected accounts — `read_write` is the minimum scope the Connect OAuth endpoint will grant. |

### 5.7 Environment operational notes

- `.env.local` leading spaces after `=` are tolerated by dotenv (the values are trimmed), but better to paste without them.
- `NEXT_PUBLIC_APP_URL` / Stripe redirect should match whichever port the dev server listens on; the project's `.claude/launch.json` pins it to 3001.
- During dev, **Confirm email** can be left off in Supabase → Authentication; flip back on before any real user signs up.
- If the browser accumulates cookies from multiple Supabase project refs (e.g. after switching `NEXT_PUBLIC_SUPABASE_URL`), chunked auth cookies from the stale ref can corrupt the current session cookie read. Fix is a full cookie + localStorage wipe for the localhost origin before signing in again.

### 5.8 Diagnostic utility (optional, useful during future RLS debugging)

Consider adding the following helper to the schema permanently — lets you call it via `supabase.rpc('whoami')` from the browser to see exactly what `auth.uid()` / `auth.role()` look like for the current request context. Catching `auth.uid() IS NULL` despite a valid-looking Bearer token is how we localized the JWT alg issue in §5.5.

```sql
create or replace function public.whoami()
returns json
language sql
stable
as $$
  select json_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'jwt_sub', (auth.jwt() ->> 'sub'),
    'jwt_role', (auth.jwt() ->> 'role')
  );
$$;

grant execute on function public.whoami() to anon, authenticated;
```

Not shipped as a migration — opt in via SQL editor if useful.

### 5.9 Post-session files delta

| Action | Count | Files |
|---|---|---|
| **NEW — schema** | 2 | `supabase/migrations/20260418000000_workspace_insert_policies.sql`, `supabase/migrations/20260418000001_fix_workspace_members_recursion.sql` |
| **NEW — server route** | 1 | `app/api/onboarding/route.ts` |
| **MODIFIED — base schema** | 1 | `supabase/migrations/20240101000000_initial_schema.sql` *(policy ordering + workspaces INSERT policy)* |
| **MODIFIED — app** | 4 | `app/onboarding/page.tsx`, `app/api/integrations/[service]/callback/route.ts`, `components/widgets/widget-grid.tsx`, `contexts/connected-accounts-context.tsx` |
| **MODIFIED — integration** | 1 | `lib/integrations/stripe/fetch.ts` *(scope `read_only` → `read_write`)* |
| **Total added/modified** | 9 files |

### 5.10 Verification evidence

- `tsc --noEmit`: zero errors after each patch batch.
- All three migrations apply cleanly on a fresh Supabase project in the order: `20240101000000` → `20240102000000` → `20260417000000` → `20260418000000` → `20260418000001`.
- Signup → onboarding → dashboard completes without an RLS error.
- Stripe OAuth completes, token row is encrypted and stored, Finance chip reads "Stripe connected" (green) via the client-side status hook.
- Test-mode Stripe account with no balance transactions renders $0 across `FinanceKpiRow`, `RevenueChart`, `RecentTransactions` — confirming the live-data path runs and the "Sample data" badge is correctly suppressed. `ExpenseBreakdown`, `CashFlow`, `ProfitMargin`, `RevenueVsExpenses` remain sample-data widgets by design (see "Explicitly not built" above).

## Session 5.11 — First Vercel deployment

Getting the same code running on `https://signalgent.vercel.app` after it was verified locally. Three separate issues, each caught in sequence.

### 5.11.1 `middleware.ts` → `proxy.ts` (Next.js 16 file-convention rename)

Next.js 16 deprecated the `middleware.ts` file convention and replaced it with `proxy.ts`. Critically, they default to different runtimes:

- `middleware.ts` → **Edge runtime** (Web APIs only; no `node:*` modules, no Node `Buffer`, no most of `@supabase/ssr`'s transitive deps)
- `proxy.ts` → **Node.js runtime** (full Node APIs available; `runtime` config option is not settable on proxy.ts — Node is fixed)

The dev server had been emitting this warning since the Next 16 upgrade:

> The "middleware" file convention is deprecated. Please use "proxy" instead.

First Vercel build failed with:

```
The Edge Function "middleware" is referencing unsupported modules:
 - __vc__ns__/0/middleware.js: @lib/supabase/middleware.ts
```

Fix: rename the root `middleware.ts` to `proxy.ts` and rename the exported function `middleware` → `proxy`. Body identical; matcher identical. The helper file at `lib/supabase/middleware.ts` (which `proxy.ts` imports from) keeps its name — the Next.js file convention only treats the *root-level* file specially.

Next.js ships a codemod for this: `npx @next/codemod@canary middleware-to-proxy .`. Doing it by hand is also a two-line diff.

### 5.11.2 Vercel Framework Preset (the one that caused hours of confusion)

After the `proxy.ts` rename, Vercel reported **Status: Ready** and the Build Logs showed every route generated correctly (`/login`, `/signup`, `/dashboard`, etc.). But every URL — the main alias, the deployment-pinned hash URL, every path — returned Vercel's platform `404: NOT_FOUND`. Runtime logs were empty because no function was being invoked.

Root cause: Vercel's **Framework Preset** was not set to `Next.js` for the project. It was set to "Other" / generic. Vercel ran `npm run build`, produced Next.js's `.next/` output, but had no routing metadata for what to do with it. Requests hit Vercel's edge, matched no registered route, and returned 404.

The misleading part: the build *succeeded* because `npm run build` exited 0. There's no build-time check that the preset matches the tooling. This is a silent misconfiguration.

Fix: **Vercel dashboard → Project → Settings → General → Framework Preset → Next.js → Save → Redeploy.** Environment variable changes don't auto-reapply to existing deployments either — any time you change preset, framework, envs, or build command, you need a fresh deploy for it to take effect.

**Lesson for fresh Vercel projects:** verify the preset immediately after connecting the Git repo, before adding any env vars or debugging anything else. It's the first thing to check when seeing blanket 404s on a successful build.

### 5.11.3 Defensive `proxy.ts` (can't take down the whole site)

The original `proxy.ts` (matching the Session 5 code drop for `middleware.ts`) called `updateSession(request)` with no try/catch. `updateSession` calls `supabase.auth.getUser()` which makes a network request to Supabase's `/auth/v1/user` endpoint. If Supabase is unreachable — transient outage, DNS hiccup, rate limit — the unhandled promise rejection propagates up and Vercel's Node runtime returns 500 for every request until it recovers.

The final `proxy.ts` wraps the call:

```ts
export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (err) {
    console.error('[proxy] updateSession failed, falling through:', err)
    return NextResponse.next({ request })
  }
}
```

If Supabase is down, the proxy falls through instead of crashing. The redirect-based URL gating stops working (an unauthenticated user could hit `/dashboard` directly), but the pages themselves still enforce access server-side — `/api/onboarding` validates the session before touching the DB, and every client-side Supabase query is RLS-gated. The degraded mode is "pages render empty instead of erroring" — a vastly better failure mode than "every page 500s."

### 5.11.4 Diagnostic detour worth recording

During 5.11.2 debugging, I also pushed a temporary `next build --webpack` to rule out a Turbopack-on-Vercel issue (documented escape hatch in Next.js 16). It wasn't the cause; the fix was the preset. Reverted back to Turbopack once the preset was corrected. Next.js 16 ships Turbopack as the default production builder — on Vercel (which ships Turbopack itself) this is the fast, supported path. Only fall back to `--webpack` if a real incompatibility turns up.

### 5.11.5 Environment variables on Vercel

All 8 envs from local `.env.local` must be set in **Settings → Environment Variables** for all three environments (Production, Preview, Development). Same values as local, with two exceptions:

| Var | Local value | Vercel value |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3001` | `https://signalgent.vercel.app` |
| *(everything else)* | *(same)* | *(same)* |

And in Stripe Dashboard → Connect → Onboarding options → Redirects, register **both**:

- `http://localhost:3001/api/integrations/stripe/callback` (local dev)
- `https://signalgent.vercel.app/api/integrations/stripe/callback` (prod)

Stripe requires exact-match, so both must be present before either flow works.

### 5.11.6 Commits landed during deployment

| Commit | Purpose |
|---|---|
| `e2950b4` | Session 5 code drop + local fixes (RLS, status enum, onboarding service route) |
| `92f2c2b` | Merge commit joining local history with GitHub's initial stub README |
| `046c94d` | Rename `middleware.ts` → `proxy.ts` (fixes Edge Function build error) |
| `3570dcb` | *Diagnostic, later reverted:* remove `proxy.ts` entirely to isolate the 404 cause |
| `e74de26` | *Diagnostic, later reverted:* switch build to `next build --webpack` |
| `7737c95` | Restore Turbopack + restore `proxy.ts` with defensive try/catch (final state) |

### 5.11.7 Verified live

- `https://signalgent.vercel.app/` → 307 → `/login` (proxy gating)
- `https://signalgent.vercel.app/login` → renders login page
- Signup → onboarding → dashboard works end-to-end against the production Supabase project
- Stripe Connect OAuth completes from prod URL with the production callback registered
- Finance widgets flip "Sample data" → live when a test-mode Stripe account is connected

## Session 6 — Gmail Integration (Pass 1)

**Goal**: End-to-end Gmail integration for the communications mode. Replace mock email data with the user's real inbox in the headline widgets. Reuse the Session 5 integration infrastructure verbatim wherever it fits, extend it only where Google's OAuth model diverges from Stripe's.

**Locked scope agreed before build**: Gmail-specific tokens/fetch/normalize/snapshot modules, hardened OAuth routes (connect + callback) shadowing the legacy generic `[service]` handler, status/disconnect flows, connect chip + popover, live-data path for `EmailClient` + live counters in `ResponseStats` + `UnreadSummary`. Deferred: `PriorityBreakdown` (needs LLM triage), response-rate and avg-reply-time computation (needs thread traversal). Legacy generic `[service]/connect` and `[service]/callback` routes kept untouched for Outlook/LinkedIn/Facebook/QuickBooks until those are migrated.

### Architectural continuity from Session 5

Every Session 5 primitive reused without modification:
- `lib/integrations/crypto.ts` — same AES-256-GCM, same `INTEGRATION_ENCRYPTION_KEY`.
- `lib/integrations/accounts.ts` — same typed CRUD on `connected_accounts`.
- `lib/integrations/cache.ts` — same in-memory `CacheStore` interface. Gmail keys are `gmail:snapshot:{companyId}`.
- `lib/integrations/auth.ts` — `requireCompanyAccess` runs at the top of every new Gmail route, action, and fetcher.
- `lib/integrations/oauth-state.ts` — same HMAC-SHA256 signed stateless state tokens, same 10-minute TTL. `service: 'gmail'` instead of `'stripe_account'`.
- `components/widgets/widget-live-indicator.tsx` — widgets still call `markLive()` via effect; `WidgetShell` hides the "Sample data" badge the same way.
- Provider pattern: a dedicated context (`CommunicationsSnapshotProvider`) loads a normalized snapshot via a server action; widgets branch on `isLive`.
- Connect is still a plain `<a href={getGmailConnectUrl(companyId)}>` — not a hook method. The hook reads status only.
- Disconnect is still the four-step flow: provider revoke → mark row disconnected + null tokens → invalidate cache → revalidate paths.

### Divergences from Stripe (real, small)

- **Token refresh.** Google access tokens expire in ~1h. `loadGmailCredentials` checks `token_expires_at`, transparently calls `refreshAccessToken` when within 60s of expiry, and persists the new access token back before returning. Callers always get a usable token. Stripe has no equivalent — its Connect tokens don't expire.
- **Single scope.** Only `https://www.googleapis.com/auth/gmail.readonly` is requested. The mailbox email address comes from Gmail's own `users.getProfile` endpoint, not a separate `userinfo.email` call. See §6.1 for why this matters.
- **Cache TTL.** 2 minutes (vs. Stripe's 5). Email feels fresher than revenue; a user expects new mail to show up sooner than a new payout.
- **Callback redirect** lands on `/communications` (vs. `/finance` for Stripe), and sets `?integration=gmail&status=...` for parity.

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/integrations/comms/model.ts` | Normalized `CommunicationsSnapshot` shape: `generatedAt`, `mailbox.emailAddress`, `totalUnread`, `threadsActive`, `responseRate` (nullable), `avgResponseTimeHours` (nullable), `messages`. `CommunicationsMessage` carries `id`, `sender.{name,email}`, `subject`, `snippet`, `receivedAt`, `unread`, `priority: 'urgent' \| 'opportunity' \| 'low'`, `tag`. |
| `lib/integrations/comms/read.ts` | `'use server'` wrapper around `getCommunicationsSnapshot`. Runs `requireCompanyAccess` first. |

### Gmail-specific files

| File | Purpose |
|---|---|
| `lib/integrations/gmail/fetch.ts` | Raw Google OAuth + Gmail REST via `fetch` (no SDK). `buildAuthorizeUrl`, `exchangeCode`, `refreshAccessToken`, `revokeToken`, `getGmailProfile`, `listMessages`, `getMessage`. `GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly'` (one scope — see §6.1). Uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| `lib/integrations/gmail/tokens.ts` | `saveGmailCredentials`, `loadGmailCredentials` (refresh-aware), `loadGmailRefreshToken`, `getGmailAccountRow`, `markGmailDisconnected`, `markGmailError`. Exports `GMAIL_SERVICE = 'gmail'`. The refresh path: if `token_expires_at` is within 60s, call `refreshAccessToken`, persist new access_token + new expiry, return the fresh token. If refresh fails, `markError` and return null so the chip can show a reconnect prompt. |
| `lib/integrations/gmail/normalize.ts` | `normalizeToSnapshot({ profile, messages, totalUnread, threadsActive })`. Parses RFC 5322 `From` headers into `{name, email}`. Derives priority from Gmail labels: `IMPORTANT` or `STARRED` → `urgent`; `CATEGORY_PROMOTIONS/SOCIAL/UPDATES/FORUMS` → `low`; else `opportunity`. Decodes HTML entities out of snippets. `responseRate` and `avgResponseTimeHours` are left null — widgets fall back to mock for those. |
| `lib/integrations/gmail/snapshot.ts` | `getCommunicationsSnapshot(companyId)` orchestrates cache → credentials (with refresh) → 4 parallel Gmail reads (`users.getProfile`, `messages.list` with `in:inbox` × 15, `is:unread in:inbox` × 1 for count, `newer_than:7d in:inbox` × 100 for distinct thread count) → per-message `metadata` fetches in parallel → normalize → cache write → `markSynced`. On error: `markGmailError` and return null. 2-minute TTL. `invalidateCommunicationsSnapshot` for cache clearing. |

### OAuth routes

| Route | Method | Behavior |
|---|---|---|
| `/api/integrations/gmail/connect?companyId=<uuid>` | GET | Verifies access, issues signed state, redirects to `https://accounts.google.com/o/oauth2/v2/auth` with `access_type=offline&prompt=consent` (required to get a refresh token). **Shadows** the legacy `[service]/connect` handler for Gmail specifically — other services still use the generic legacy path. |
| `/api/integrations/gmail/callback` | GET | Handles Google redirect. Verifies state signature + expiry, re-verifies company access, checks userId matches state payload, exchanges code (passes the exact same `redirect_uri` as the authorize step — Google enforces match), calls `getGmailProfile` for the mailbox email address, saves encrypted credentials via `saveGmailCredentials`, invalidates snapshot cache, redirects to `/communications?integration=gmail&status=connected`. Handles `?error=` from Google and state tampering gracefully. |

### Client-side integration surface

| File | Purpose |
|---|---|
| `hooks/use-gmail-connection.ts` | `useGmailConnectionStatus(companyId)` returns `{ status, isLoading, error, refresh }`. Exports `getGmailConnectUrl(companyId)` — pure URL builder, used as an href. |
| `contexts/communications-snapshot-context.tsx` | `CommunicationsSnapshotProvider` + `useCommunicationsSnapshot()`. Loads `CommunicationsSnapshot` via `readCommunicationsSnapshot` server action. Snapshot null when there's no Gmail connection or the fetch errors. |
| `components/integrations/gmail-connection-chip.tsx` | Three-state chip (not connected / connected / error). Same 280px popover shape as the Stripe chip, with the Gmail mailbox email as the account label. Disconnect runs via `useTransition` then `refresh()`. |

### Files modified

| File | Change |
|---|---|
| `lib/integrations/actions.ts` | Added `getGmailStatus` and `disconnectGmail`. `disconnectGmail` revokes at Google (`revokeToken` on the refresh token — kills both it and any derived access token) then falls through to the standard local cleanup. `ConnectionStatusView.service` widened from the literal `'stripe_account'` to `ConnectedService` so a single shape serves both providers. |
| `components/widgets/content/communications-widgets.tsx` | `EmailClient` split into Live / Mock variants. Live uses real sender (name or email), subject, snippet preview, `receivedAt`-derived time label, Gmail's own label-derived `tag`, and an "Open in Gmail" link pointing at the selected message id. `ResponseStats` reads `snapshot.totalUnread` and `snapshot.threadsActive` from live; `responseRate` and `avgResponseTimeHours` stay mock for now (null in v1). `UnreadSummary`'s top-line count goes live; urgent/opportunity/can-wait buckets stay mock (need LLM triage). `PriorityBreakdown` unchanged. |
| `app/(app)/communications/page.tsx` | Wrapped in `CommunicationsSnapshotProvider`. Renders `GmailConnectionChip` in a right-aligned header row above `WidgetGrid`. |

### Environment variables required

| Var | Purpose | How to obtain |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web client ID. | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Web client secret. | Same credential. |

Also: register redirect URIs `http://localhost:3001/api/integrations/gmail/callback` and `https://signalgent.vercel.app/api/integrations/gmail/callback` under the OAuth 2.0 Client ID's **Authorized redirect URIs**. Google enforces exact match on the redirect step.

`INTEGRATION_ENCRYPTION_KEY` and `OAUTH_STATE_SECRET` from Session 5 are reused.

### Data flow end-to-end

1. User visits `/communications`. `CommunicationsSnapshotProvider` mounts, calls `readCommunicationsSnapshot(activeCompany.id)`.
2. Server action runs `requireCompanyAccess`, then `getCommunicationsSnapshot(companyId)`.
3. Cache check (`gmail:snapshot:{companyId}`, 2 min TTL). Hit → return.
4. `loadGmailCredentials`: decrypt tokens, check expiry. If `token_expires_at` within 60s → call Google's `/token` endpoint with `grant_type=refresh_token`, persist new access token, return fresh one. No refresh token on file → flag the row with `markError` and return null.
5. Fire 4 parallel Gmail calls: `users.getProfile`, recent inbox list (15), unread count, last-7d thread list (up to 100).
6. Fetch `metadata` for each of the 15 recent messages in parallel (From, Subject, Date, To headers + snippet).
7. Normalize into `CommunicationsSnapshot`. Priority derived from Gmail labels.
8. Cache the snapshot. `markSynced`.
9. Widgets render from snapshot and call `markLive()`. Shell hides the "Sample data" badge.
10. Chip shows "Gmail connected". Click → popover with mailbox email + Disconnect.
11. Disconnect: revoke refresh token at Google (best-effort), `markDisconnected` (nulls tokens), `invalidateCommunicationsSnapshot`, `revalidatePath('/communications')` + `/dashboard`.

### Security properties (unchanged from Session 5)

- HMAC-signed stateless state tokens with nonce + 10-min expiry.
- Callback re-validates authenticated user against state payload.
- AES-256-GCM at rest with random IV and auth tag.
- Disconnect nulls tokens and clears cache; `provider_account_id` retained for audit.

### Caching properties (unchanged shape; different TTL)

- Per-instance in-memory. Key pattern `gmail:snapshot:{companyId}`. TTL 2 minutes. Invalidated on `disconnectGmail`, `saveGmailCredentials` (via callback), and via the same `CacheStore.invalidate` prefix match.

### Explicitly not built (for clarity when pass 2 lands)

- **`PriorityBreakdown`** — requires LLM triage across the inbox. Locked mock-only in pass 1.
- **`responseRate` and `avgResponseTimeHours`** — require thread traversal and Sent-label matching. Null in v1 snapshots; widgets fall back to the mock values for those two specific stats.
- **Incoming message webhooks / push notifications.** Polling only; every snapshot read hits Gmail within the cache TTL.
- **Outgoing actions** (Reply, Archive, etc.). Pass 1 is read-only — would require upgrading scope beyond `gmail.readonly`.
- **Multi-mailbox per company.** One Gmail account per company.
- **Outlook, LinkedIn, Facebook, QuickBooks migration to the hardened pattern.** They continue to use the legacy generic `[service]/connect` and `[service]/callback` route handlers. Those routes store tokens in plaintext and use a cookie-based plain-base64 state — acceptable as an interim state, flagged for a future migration pass.

### Build verification

- `tsc --noEmit` with strict mode: zero errors.
- Dev server (port 3001) starts clean, no console or server errors.
- 4 communications widgets render; the 2.5 live-capable ones (EmailClient + the two counters in ResponseStats + the top line of UnreadSummary) degrade to mock when snapshot is null. `PriorityBreakdown` unchanged.
- No schema migration required — Gmail uses the `connected_accounts` shape already added in Session 5's `20260417000000_integration_accounts_extension.sql`.
- Legacy `[service]` routes untouched; other services still flow through them unchanged.

### Files summary

| Action | Count | Files |
|---|---|---|
| **NEW — infra** | 2 | `lib/integrations/comms/{model,read}.ts` |
| **NEW — gmail** | 4 | `lib/integrations/gmail/{fetch,tokens,normalize,snapshot}.ts` |
| **NEW — routes** | 2 | `app/api/integrations/gmail/{connect,callback}/route.ts` |
| **NEW — client** | 3 | `hooks/use-gmail-connection.ts`, `contexts/communications-snapshot-context.tsx`, `components/integrations/gmail-connection-chip.tsx` |
| **MODIFIED** | 3 | `lib/integrations/actions.ts`, `components/widgets/content/communications-widgets.tsx`, `app/(app)/communications/page.tsx` |
| **Total** | 14 files |

## Session 6 retrospective — fixes applied during first real Gmail connect

### 6.1 Google OAuth 403 `access_denied` — caused by OIDC scope auto-expansion

**Symptom.** First connect attempts bounced to Google's consent screen with `Error 403: access_denied`. Test user was added to the Audience tab, Gmail API was enabled, scopes were listed in the Data Access tab, redirect URIs matched — yet every attempt failed before the user could even grant consent.

**Smoking gun.** The scope parameter in Google's error URL showed:
```
scope=https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid
```
The `openid` was not in our request. Google was auto-expanding `userinfo.email` into the full OIDC triple (`openid` + `email`). The Data Access tab's listed scopes did not include `openid`, so Google rejected.

**Root cause.** `https://www.googleapis.com/auth/userinfo.email` is the legacy URL form of the modern OIDC `email` scope. When Google receives that scope, it treats the request as OpenID Connect and implicitly requires `openid` to also be listed in the consent screen's Data Access configuration.

**Fix.** Dropped `userinfo.email` entirely. The mailbox email address is available from Gmail's own `users.getProfile` endpoint (returns `emailAddress`), which only requires `gmail.readonly` — a scope we already need anyway. Code changes:

| File | Fix |
|---|---|
| `lib/integrations/gmail/fetch.ts` | `GMAIL_SCOPES` reduced to the single `gmail.readonly` URL. Removed `include_granted_scopes=true` from `buildAuthorizeUrl` (it was pulling in previously-granted scopes on retries and adding to the noise). Deleted the now-unused `getUserInfo` function + `GoogleUserInfo` type + `GOOGLE_USERINFO_URL` constant. |
| `app/api/integrations/gmail/callback/route.ts` | Replaced `getUserInfo(accessToken)` call with `getGmailProfile(accessToken)`; read `profile.emailAddress` instead of `info.email`. |

After this change — plus the Data Access tab holding only `gmail.readonly` — the consent screen rendered and authorization completed.

### 6.2 Google Auth Platform UI — test users silently fail to save

Reproduced twice during setup: the new tabs-based Google Auth Platform UI (the replacement for the 4-step wizard) drops test-user writes if you click **SAVE AND CLOSE** too quickly after entering the email. The email must first be converted into a chip (press `Enter` / `Tab` or wait for blur validation) before SAVE. Hard refresh (⌘+Shift+R) sometimes reveals that the user was already saved but the stale console UI hadn't picked it up.

Not a code issue — documented here as a troubleshooting note for future integrations that use Google OAuth (Google Analytics next).

### 6.3 Local verification

- Local smoke test from `digitaldreamsmiths@gmail.com`: signup → dashboard → `/communications` → `Connect Gmail` → Google consent (only `gmail.readonly` listed) → approve → redirected back with `?integration=gmail&status=connected`.
- Within a second the chip flipped to green **"Gmail connected"**.
- `EmailClient` populated with real inbox senders/subjects/snippets; "Open in Gmail" links resolve to the corresponding message.
- `ResponseStats`' `Total unread` and `Threads active` numbers match Gmail's own counts.
- `UnreadSummary` top-line unread count reflects the real inbox; priority buckets remain mock.
- `PriorityBreakdown` unchanged (as scoped).

### 6.4 Commit + production deployment

Single commit for the full Session 6 drop: **`f2f0c37`** — `Session 6: Gmail integration + live Communications snapshot` (15 files, +1796/−10). Pushed to `origin/main`, Vercel auto-deployed.

Production env vars added before the deploy ran against real traffic:

| Var | Scope | Source |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Production + Preview + Development | Google Cloud Console → OAuth 2.0 Client IDs → Web client 1 |
| `GOOGLE_CLIENT_SECRET` | Production + Preview + Development | Same credential |

Google Cloud OAuth client had both redirect URIs registered ahead of time:
- `http://localhost:3001/api/integrations/gmail/callback` (dev)
- `https://signalgent.vercel.app/api/integrations/gmail/callback` (prod)

**Verified live** on `https://signalgent.vercel.app`:
- Login → `/communications` → `Connect Gmail` → Google consent → approve → callback lands at `?integration=gmail&status=connected` with the chip flipped to green.
- `EmailClient` populates with real inbox messages; `Total unread` and `Threads active` match Gmail.
- Disconnect + reconnect cycle works; tokens re-encrypt cleanly on re-save.

OAuth consent screen publishing status is still `Testing` — only `digitaldreamsmiths@gmail.com` can complete the prod OAuth flow. Adding additional test users or submitting for Google verification is deferred until we're ready for external beta users.

---

## Session 7 — LLM-driven email triage

**Goal**: Flip the last two mock surfaces in the Communications mode — `PriorityBreakdown` pie and `UnreadSummary` urgent/opportunity/canWait buckets — to live data via Claude-powered classification. Ship the LLM infrastructure (client, task→model map, token/cost logging) that every future summary and recommendation feature will reuse.

**Locked scope agreed before build**: Triage only. Claude API singleton, static task→model map with an override hook, per-batch cache, one Anthropic call per snapshot fetch, structured output via tool use. Deferred: per-message reasoning surfaced in the UI, summaries, reply drafts, adaptive model escalation.

### Architectural choices

- **Model selection is a map, not a toggle.** `lib/llm/models.ts` exports a static `LLMTask → modelId` table (`triage → claude-haiku-4-5`, `summary → claude-sonnet-4-6`, `recommendation → claude-sonnet-4-6`) plus `pickModel(task, override?)`. Call sites declare the task; the map picks the model; the optional override exists for evals/debugging. No adaptive escalation (second call on low confidence) — not worth the latency hit until we have data showing Haiku misclassifies a meaningful slice.
- **One SDK instance.** `lib/llm/client.ts` is a lazy singleton. Reads `ANTHROPIC_API_KEY` on first use and throws a human-readable error if missing. Exposes `logUsage({task, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, durationMs})` — every LLM caller logs a single grep-able line per request for cost/latency visibility.
- **Triage is batched, not per-message.** One call classifies the whole 15-message recent set. Model-side `tool_choice: {type: 'tool', name: 'classify_emails'}` forces Claude to return `{classifications: [{id, priority}, ...]}` in one shot. No text parsing, no retries.
- **Fingerprint-keyed cache.** `lib/integrations/gmail/triage.ts` hashes the sorted message IDs (`sha256`, first 16 hex chars) into the cache key: `gmail:triage:{companyId}:{idHash}`. Any new inbound message changes the hash and the entry doesn't exist, so triage re-runs automatically; identical inbox state within 5 min reuses the cached classification. TTL is 5 min (longer than the snapshot's 2 min — same messages usually triage identically).
- **Null is a first-class degraded mode.** Missing API key → `getAnthropicClient` throws → `triageMessages` catches, logs a warning, returns null. Network error → caught, returns null. Malformed tool output → returns null. The snapshot sets `priorityBreakdown` to null and widgets fall back to mock counts — same "live or mock" switch the rest of the app already uses.
- **Types extended, not branched.** `CommunicationsMessage` gains `triagedPriority: 'urgent' | 'opportunity' | 'canWait' | null`; `CommunicationsSnapshot` gains `priorityBreakdown: PriorityBreakdown | null`. The heuristic `priority` field stays as-is for backward compatibility and as a fallback signal.

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/llm/models.ts` | `LLMTask` union (`triage \| summary \| recommendation`), static `TASK_MODELS` map, `pickModel(task, override?)`. Bump entries here when real cost/quality data argues for a different default. |
| `lib/llm/client.ts` | `getAnthropicClient()` lazy singleton reading `ANTHROPIC_API_KEY`, `LLMUsage` shape, `logUsage(u)` single-line emitter. Throws a specific error if the key is missing. |
| `lib/integrations/gmail/triage.ts` | `triageMessages(companyId, messages, {modelOverride?})` — batched classification via tool use. Builds user prompt with `{id, from, subject, snippet, receivedAt, unread}` for each message, forces `classify_emails` tool, parses `{classifications}`, validates every entry, returns `{byId: Record<id, bucket>, breakdown: {urgent, opportunity, canWait}}` or null. Cache-keyed by sorted-IDs hash, 5-min TTL. Logs usage per call. |

### Files modified

| File | Change |
|---|---|
| `lib/integrations/comms/model.ts` | Added `triagedPriority` to `CommunicationsMessage`, `priorityBreakdown: PriorityBreakdown \| null` to `CommunicationsSnapshot`, new `PriorityBreakdown` interface. Heuristic `priority` field comment updated to call it a fallback. |
| `lib/integrations/gmail/normalize.ts` | Seeds `triagedPriority: null` on every message and `priorityBreakdown: null` on the snapshot. Triage fills them in afterward in `snapshot.ts`. |
| `lib/integrations/gmail/snapshot.ts` | After `normalizeToSnapshot`, calls `triageMessages(companyId, snapshot.messages)`. On non-null result: assigns `msg.triagedPriority` from `triage.byId[msg.id]` and sets `snapshot.priorityBreakdown = triage.breakdown`. Cached snapshot already includes the triage output — no separate cache write for triage beyond the fingerprint cache. |
| `components/widgets/content/communications-widgets.tsx` | `UnreadSummary` now reads `snapshot?.priorityBreakdown` for the Urgent/Opportunity/Can wait bucket counts (mock fallback when null). `PriorityBreakdown` converted from a static mock pie to a snapshot-reading live widget with `useCommunicationsSnapshot()` + `useWidgetLiveIndicator()` — reads `snapshot?.priorityBreakdown` for the pie, falls back to mock when null. Both widgets call `markLive()` when live data is present. |
| `package.json` / `package-lock.json` | `@anthropic-ai/sdk` ^0.x added to dependencies. |

### Triage prompt + tool

System prompt names the three buckets, gives concrete examples per bucket ("urgent" = customer problems, contract deadlines, investor asks; "opportunity" = warm intros, prospect replies, press; "canWait" = promos, newsletters, receipts), tells the model to be skeptical of marketing emails that pretend to be personal, and requires a single `classify_emails` tool call containing every input id exactly once. Tool schema enforces `priority ∈ ['urgent','opportunity','canWait']` via JSON schema `enum`.

No `cache_control` markers in v1 — the short system prompt + short tool schema + dynamic message payload together don't clear Haiku's 4096-token cache minimum. `logUsage` surfaces `cacheReadTokens` and `cacheWriteTokens` per call so we can tune once we have volume.

### Local verification

- `@anthropic-ai/sdk` installed; `ANTHROPIC_API_KEY` added to `.env.local`.
- `tsc --noEmit` clean across the project after the type extensions.
- Dev server restarted; `/communications` loaded against the real Gmail-connected inbox (`digitaldreamsmiths@gmail.com`, 201 unread).
- Two triage calls observed in logs (context + follow-up nav):
  - `[llm] task=triage model=claude-haiku-4-5 in=5549 out=515 cacheRead=0 cacheWrite=0 ms=4206`
  - `[llm] task=triage model=claude-haiku-4-5 in=4889 out=524 cacheRead=0 cacheWrite=0 ms=4293`
  - ~4.2s per call, ~$0.008 per call at Haiku pricing.
- `UnreadSummary` flipped live: **201 unread** top-line, buckets **0 urgent / 0 opportunity / 15 can wait**. Correct for the actual inbox contents (Temu, Canva, Instagram, magic links, Planet Fitness — all promotional/transactional). Claude correctly rejected "urgent" for every item.
- `PriorityBreakdown` pie flipped live: full "Can wait" slice, legend `Urgent (0), Opportunity (0), Can wait (15)`.
- No console errors, no server errors.

### Residuals heading into Session 8

- `ResponseStats.responseRate` and `ResponseStats.avgReplyTime` are still mock — still need thread traversal and Sent-label matching (scoped out intentionally).
- No prompt caching yet. Once a stable instruction prefix grows past ~4096 tokens (or we switch triage to Sonnet 4.6 with its 2048-token minimum), adding `cache_control: {type: 'ephemeral'}` on the system block should cut input cost ~10× on steady-state reruns.
- Triage runs inline inside `getCommunicationsSnapshot`, so the first uncached snapshot fetch now takes ~4s instead of ~1.5s. Acceptable at 2-min snapshot TTL; revisit if users notice.
- In-memory `CacheStore` still resets on every Vercel deploy — triage entries evaporate alongside snapshots. The Redis/Upstash swap mentioned in the Session 6 handoff now has one more consumer (`gmail:triage:*`), all under the same `CacheStore` interface.
- `lib/llm/client.ts` is Claude-specific but the shape (`pickModel`, `logUsage`) is provider-agnostic. If we ever want to A/B test another model family, the abstraction is already in the right place.

### Production env

`ANTHROPIC_API_KEY` added to Vercel (Production + Preview + Development) before the next deploy. Rotation policy is the user's to define — for dev, the key in `.env.local` is reused locally.

## Session 8 — Communications mode goes 100% live (response-stats via Gmail thread traversal)

**Goal**: Flip the last mock surface in Communications mode — `ResponseStats.responseRate` and `ResponseStats.avgReplyTime` — to live data computed from the real mailbox. After Session 8 the whole mode is live; zero mock fallbacks render when the user is Gmail-connected.

**Locked scope agreed before build**: Per-thread traversal over a 30-day inbound window with `SENT`-label matching for the reply test. `threads.list` + `threads.get` (format=minimal) rather than per-message `messages.get` — one thread call returns every message's `internalDate` + `labelIds`, the cheapest shape that still yields timing + direction. Deferred: response-rate trend deltas, per-contact/per-thread drill-in, partial-sample UI messaging.

### Architectural choices

- **Semantics are per-thread, not per-message.** A thread is in-sample if it has at least one `INBOX`-labeled message whose `internalDate` falls inside the 30-day window. The thread is "responded" when some `SENT`-labeled message in the same thread has `internalDate` strictly greater than the earliest in-window inbound. `responseRate = round(responded / sample × 100)`; `avgResponseTimeHours = mean(firstSent − firstInbound)` across responded threads. Cleaner to reason about than per-message, and matches how standard inbox-analytics dashboards render "response rate" + "time to first reply."
- **Sent can sit outside the window.** A reply two weeks after an inbound 29 days old still counts — the window constrains the *inbound* side only. This is why we walk full threads instead of just counting sent messages in the last 30d.
- **Bounded traversal, ceiling-safe concurrency.** `threads.list` capped at 200 threads (covers everyone short of power users; bigger mailboxes get a stable-biased sample). Parallel `threads.get` in chunks of **5** with a 120 ms inter-batch pause — Gmail's undocumented per-user concurrent-request ceiling 429s well before the published QPS quota, and 5+pause tested clean across the full 200 where 25 and 8 both 429ed with `Too many concurrent requests for user`.
- **429s retry narrowly; permanent per-thread failures degrade.** `fetchThreadWithRetry` retries on `(429)|rateLimitExceeded|RESOURCE_EXHAUSTED` with 600 ms × attempt backoff, up to 3 attempts. Non-429 errors propagate immediately. A thread that still fails after retries is *dropped* from the sample rather than nuking the whole metric — the stat returns null only when the *entire* batch fails, matching the same "live or mock" switch used by triage and the snapshot itself.
- **Company-scoped cache with a 30-minute TTL.** `gmail:response-stats:{companyId}`. The metric is a 30-day trailing average, so a 30-min refresh is tighter than the noise floor and spares 200 thread.get calls on every snapshot fetch. Snapshot TTL stays at 2 min; response-stats survives 15 snapshot refreshes per hit.
- **Parallel with triage.** Both are best-effort overlays on `normalizeToSnapshot`. `Promise.all([triageMessages, computeResponseStats])` in `snapshot.ts` keeps end-to-end latency gated by the slower of the two (~7s for first-uncached traversal vs. ~4s for triage). Neither blocks the other's result.

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/integrations/gmail/responseStats.ts` | `computeResponseStats(companyId, accessToken)` — list threads for 30d inbound, fetch minimal threads in chunks of 5, `analyzeThread` per thread (earliest inbound + earliest sent-after), aggregate. Returns `{responseRate, avgResponseTimeHours, sampleSize}` or null. Logs one grep-able line per run: `[response-stats] company=… threads=… responded=… rate=…% avg=…h failures=… ms=…`. |

### Files modified

| File | Change |
|---|---|
| `lib/integrations/gmail/fetch.ts` | Added `listThreads`, `getThread`, `GmailThreadRef`, `GmailThreadListResponse`, `GmailThread`. `getThread` defaults to `format=minimal` — returns `messages[*].{internalDate, labelIds}` without payload/headers, the cheapest format that supports timing + direction analysis. |
| `lib/integrations/gmail/snapshot.ts` | Wrapped triage + response-stats in a single `Promise.all`. Overlay pattern: snapshot fields stay null until the respective call resolves non-null, then overwrite. Both cache in their own keys; the outer snapshot cache (2 min TTL) stores the already-overlaid snapshot. |
| `lib/integrations/gmail/normalize.ts` | Docstring updated — `responseRate`/`avgResponseTimeHours` no longer "deferred," just left null for overlay. |
| `lib/integrations/comms/model.ts` | `responseRate` + `avgResponseTimeHours` docstrings rewritten to reflect per-thread semantics. |
| `components/widgets/content/communications-widgets.tsx` | `ResponseStats` comment updated — removed the "not computed yet" note; the widget already reads `snapshot.responseRate` / `snapshot.avgResponseTimeHours` and falls back to mock on null, so no logic change was needed. |

### Rate-limit tuning narrative

First pass: concurrency **25** → all threads 429ed with `Too many concurrent requests for user`. Gmail's concurrent-request ceiling is undocumented but clearly lower than the published QPS quota.

Second pass: concurrency **8** with a 2-attempt 500 ms retry → still 429ed. Retrying 8 threads simultaneously just re-synchronizes the concurrency burst; backoff has to be paired with lowered peak.

Third pass (final): concurrency **5**, 120 ms inter-batch pause, up to 3 retries with 600 ms × attempt backoff → **0 failures across 200 threads**, 7.4 s end-to-end. The pause matters: without it, a slow response in one batch lets the next batch dispatch mid-recovery and stack on top.

### Local verification

- `tsc --noEmit` clean.
- `.next/` cleared once during debugging when a stopped dev server left artifacts that 404ed every protected route on the fresh start. Clean `.next` + `preview_start` → routes compiled on demand as expected.
- `/communications` loaded against the real Gmail-connected inbox (`digitaldreamsmiths@gmail.com`, 201 unread, 99 threads active).
- Response-stats log line:
  - `[response-stats] company=ce650d4b-5525-44cb-a3fd-e511e5e5bcac threads=200 responded=5 rate=3% avg=14.24h failures=0 ms=7433`
  - Reads correctly: the user's inbox is dominated by promos/transactional (Temu, Canva, Instagram, magic links, Planet Fitness — see Session 7 notes). 5 real-human responses out of 200 threads in 30 days is an honest read, and a 14-hour avg reply time across those 5 is plausible for a founder's cadence.
- ResponseStats widget reads live values from the snapshot: **Response rate 3%, Avg reply time 14.2h, Total unread 201, Threads active 99**.
- Triage still runs cleanly in parallel: `[llm] task=triage model=claude-haiku-4-5 in=5549 out=515 ms=4406`.
- No console errors, no server errors.

### Residuals heading into Session 9

- **No sample-size UI signal.** A mailbox with 3 inbound threads shows the same "3%" as one with 200 threads, and the widget has no way to flag "low confidence." `responseStats` already returns `sampleSize` internally but snapshot.ts drops it. If this becomes user-visible noise, surface sampleSize on the snapshot and render a "(n threads)" suffix or fade the tile when sample is small.
- **Single window only.** Trailing 30 days. No week-over-week delta, no sparkline. Product call when we revisit the widget.
- **200-thread cap.** Power users (thousands of threads/month) get a stable-biased sample — the 200 most recent inbound threads. Paginating past 200 would mean more `threads.list` calls + more `threads.get` fanout. Revisit if the user asks, otherwise the 7.4s latency ceiling stays reasonable.
- **Cold-path latency.** First-uncached snapshot fetch is now ~7-8 s (was ~4 s before Session 8) since response-stats dominates and runs in parallel with triage. Subsequent 30 min: free. Redis/Upstash swap would also let response-stats survive Vercel redeploys — currently it rebuilds from scratch every deploy.
- **429 handling is Gmail-specific.** `isRateLimitError` pattern-matches Google's error message text. If we add another provider (Outlook for Session 6.x backlog), that provider will want its own retry predicate.
- **Workspace-scoped caching.** `gmail:response-stats:{companyId}` is correct for the multi-tenant shape, same as snapshots. If we ever start caching by `userId` anywhere, be consistent.
- **No prompt caching yet** (carry-over from Session 7). Still waiting on either a longer system prompt or a Sonnet 4.6 migration to hit the cache threshold. Session 9 summaries will be the forcing function — likely Sonnet 4.6 territory.

## Session 9 — LLM summaries + reply drafts (text-only V1)

**Goal**: Ship the two interactive LLM surfaces — per-thread **Summarize** and **Draft reply** — that the mock `EmailClient` has been teasing since Session 2. On-demand (button click in the preview pane), Sonnet 4.6-powered, inline render. No Gmail-native draft push yet; the user copies the generated text.

**Locked scope agreed before build**: Per-thread, on-demand, text-only. User clicks → server action → Sonnet 4.6 → plaintext back → inline panel. Summaries cached per-thread fingerprint (10 min TTL) so re-clicking the same thread is instant; drafts NOT cached (user explicitly wants fresh angles). Full message bodies required — `format=metadata` only returned a ~200 char snippet, worthless for summary quality, so Session 9 had to add a `format=full` path and MIME-part walker. Deferred: Gmail-native draft creation (needs `gmail.compose` scope + fresh consent + send path), streaming responses, prompt caching, per-turn draft refinement.

### Architectural choices

- **Single LLM call per action, no tool use.** Summary and draft are both plain-text outputs — using `tools` + forced tool choice (Session 7's pattern) would add serialization overhead without gaining structure we care about. The summary prompt returns a paragraph; the draft prompt returns the reply body or the literal string `NONE`. The `NONE` sentinel is parsed server-side into `{draft: null}` and rendered as a friendly empty-state ("Nothing to reply to here — the thread is promotional or already handled.") in the UI.
- **Sonnet 4.6 with adaptive thinking + `effort: "medium"`.** Both tasks benefit from the model thinking before writing. Adaptive thinking dynamically picks the budget — no `budget_tokens` to tune. `effort: "medium"` is the favorable point for an interactive UI call where latency matters more than maximum thoroughness; `high` pushed summaries to ~6 s with no measurable quality lift in our sample. Observed end-to-end: summary ~3.5–4.5 s, draft ~1–10 s (wider range since the model thinks more when it actually has something to write).
- **Structured type layering.** Added `threadId` to `CommunicationsMessage` so the widget can pass thread IDs back to the server action without the LLM call having to re-derive them from message IDs. Extended `GmailMessagePart` to describe the full MIME tree (`mimeType`, `body.data`, recursive `parts`, `filename`) so `getThread({format: 'full'})` responses deserialize cleanly.
- **MIME walker prefers plain, falls back to HTML.** `lib/integrations/gmail/threadContext.ts` → `extractFromPart` recurses into `multipart/*` containers and decodes `text/plain` parts verbatim; `text/html` parts go through a bare-bones tag strip + entity decode. Attachments (`filename` present) are not read — their filenames are captured separately and surfaced to the model as `Attachments: foo.jpg, bar.pdf` so it at least knows they exist. Per-message body capped at 8,000 chars (prompt-size guard — a typical thread stays well under this).
- **Thread context cache is the expensive shared layer.** `gmail:thread-context:{companyId}:{threadId}:{idHash}` with 10-min TTL. Summary reuses it (same fingerprint → same context). Draft reuses it too. This means a Summarize click followed by a Draft click only pays for one Gmail fetch, not two — the second call hits the context cache and only pays Sonnet. Any new message in the thread changes the ID hash and the context rebuilds automatically (same pattern as triage).
- **Summary cached; draft not.** Summary result cached per the same thread fingerprint. Draft not cached — the UX is "give me a draft, I didn't love that one, give me another" and a cache defeats that immediately. A cheap future optimization: cache drafts keyed on `{threadId, idHash, regenerationCount}` and increment on a "regenerate" button.
- **Null is a first-class degraded mode (Session 7 pattern, carried forward).** Missing `ANTHROPIC_API_KEY` → throws → caught → returns null. API error → caught → returns null. Malformed response → returns null. The server action surfaces null as `{ok: false, error: "Couldn't summarize this thread. Try again in a moment."}` which the widget renders in a red-tinted panel.
- **Thread ID flows through the type system, not out-of-band.** The alternative — have the server action re-fetch the message by ID and pull the `threadId` off that — would double the Gmail round-trips on every click for no reason. Putting `threadId` on `CommunicationsMessage` is the smaller, more honest change.

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/integrations/gmail/threadContext.ts` | `getThreadContext(companyId, threadId)` — loads Gmail creds, fetches the thread with `format=full`, walks each message's MIME tree, extracts plaintext bodies with HTML fallback + entity decode, truncates at 8k chars/message, returns `ThreadContext = {threadId, ownerEmail, messages: [{id, receivedAt, sentByOwner, from, to, subject, body, attachments}]}`. Cached per company+thread+message-id-hash for 10 min. |
| `lib/integrations/gmail/assist.ts` | Both LLM entry points: `summarizeThread(companyId, threadId) → {summary} \| null` and `draftReply(companyId, threadId) → {draft: string \| null} \| null`. Shared `callClaudeText()` helper handles Sonnet 4.6 invocation, adaptive thinking, `effort: 'medium'`, usage logging, typed `Anthropic.APIError` catch, text-block extraction. Summary cached in `gmail:thread-summary:{companyId}:{threadId}:{ids}`, draft uncached. |
| `lib/integrations/comms/assist.ts` | `'use server'` — server actions `summarizeEmailThread` + `draftEmailReply`. Both enforce `requireCompanyAccess` before touching the mailbox. Return `AssistResult<T> = {ok: true, body: T \| null} \| {ok: false, error: string}` — the client renders `error` verbatim, so the string has to be user-facing (not an upstream exception). |

### Files modified

| File | Change |
|---|---|
| `lib/integrations/gmail/fetch.ts` | Extended `GmailMessage.payload` to `GmailMessagePart & {headers}`. Added the full `GmailMessagePart` interface (`mimeType`, `filename`, optional `body.data` base64url, recursive `parts`) so `format=full` responses type-check. |
| `lib/integrations/comms/model.ts` | Added `threadId: string` to `CommunicationsMessage`. |
| `lib/integrations/gmail/normalize.ts` | Seeds `threadId` from `m.threadId` when building each `CommunicationsMessage`. |
| `components/widgets/content/communications-widgets.tsx` | `EmailClientLive` now has Summarize + Draft Reply buttons, per-thread `AssistState` machines (idle \| loading \| success \| empty \| error), `AssistPanel` rendering with `whiteSpace: pre-wrap` and a Copy button on the draft panel, auto-reset on `selected.threadId` change. Calls `useCompany()` to get `companyId`. |

### Prompt design

Both prompts are plain-text, under 400 tokens each — deliberately short so they don't cross Sonnet 4.6's 2048-token cache minimum. The system prompt does the heavy lifting; the user prompt is just the rendered thread.

**Summary prompt**: "2–4 short sentences. Newsletter-length. Lead with what the counterparty wants. Mention deadlines or dollar figures verbatim. If the founder replied, note where the ball sits. Skip pleasantries, signatures, unsubscribe footers. Don't invent facts. Plain text, no 'Summary:' prefix."

**Draft prompt**: "Match the thread's tone. Address the ask. 2–5 short sentences unless the thread calls for more. Sign off with the owner's first name if inferrable. No subject line, no 'Dear …'. Don't invent facts — use [confirm date] placeholders. If the thread is promotional / transactional / already handled, return the single word NONE."

The `NONE` sentinel is load-bearing — without it, the model would write a useless "Thanks for the notification!" reply to every Venmo statement. Tested as expected on a Venmo quarterly statement (returned `NONE`, 5 output tokens, 1.1 s).

### Local verification

- `tsc --noEmit` clean.
- Test 1 — **Venmo Quarterly Statement** (automated):
  - Summary: *"Automated quarterly statement from Venmo notifying that the Jan–Mar 2026 transaction history for @thedvegroup is now available. No action required and no ask from a counterparty — this is a system notification. Nothing time-sensitive or dollar-specific is mentioned. No reply needed."* — correctly identifies as automated, no invented facts.
  - Draft: model returned `NONE` → UI shows "Nothing to reply to here — the thread is promotional or already handled."
  - Logs: `[llm] task=summary model=claude-sonnet-4-6 in=727 out=67 ms=3579` and `[llm] task=recommendation model=claude-sonnet-4-6 in=790 out=5 ms=1113`.
- Test 2 — **Marvin C. Jones / National Day of Prayer** (real-human sender with an image-only body):
  - Summary: correctly flags the image-attachment limitation ("the image content isn't readable here, so the actual ask or details are unclear") — the prompt's "don't invent facts" rule held under ambiguity.
  - Draft: *"Hey Marvin, thanks for reaching out — we got your message, but unfortunately the image attachment didn't render clearly on our end. Could you resend the details or paste the info as text so we can take a look and follow up properly? The DVE Group"* — casual tone matched, addresses the ask, no invented commitments. Copy button worked.
  - Logs: `[llm] task=summary in=369 out=135 ms=4459` and `[llm] task=recommendation in=432 out=244 ms=9604` (draft thought longer because it actually had something to write).
- Thread context cache verified: a second Summarize click on the same thread returned instantly without a new Gmail fetch (context cache hit) — a fresh Sonnet call still ran because the summary cache had the same fingerprint as the first successful result, served instantly from summary cache too.
- No server errors. Console warnings present (React complaining about `borderLeft` + `border: 'none'` shorthand mix in the message-list buttons) — **pre-existing** in `EmailClientLive` since Session 6, unrelated to Session 9. Flagged as residual.

### Residuals heading into Session 10

- **Text-only drafts.** Gmail-native draft creation (writing to the user's Drafts folder via `gmail.compose` / `gmail.modify` scope + the `users.drafts.create` endpoint) is the obvious next step, but it means re-requesting consent and migrating every existing Gmail token. Scope-expansion session; not bundled with this one.
- **No streaming.** A 9.6 s draft feels slow without a stream. Sonnet 4.6 supports `messages.stream()` and `finalMessage()` — a future pass can stream text deltas into the panel as they arrive. Structurally straightforward; deferred because the pure-text panel was simpler to ship first and latency is tolerable for one-off clicks.
- **No draft regeneration UX.** User can click Draft Reply again to re-roll, but since drafts aren't cached every click costs a fresh Sonnet call. A "Regenerate with a different angle" prompt variation would be more useful than random re-sampling.
- **Attachments stay invisible.** The walker surfaces attachment filenames to the model but never reads them. PDFs and images go unread; for a founder's inbox where attachments carry the payload (contracts, decks, invoices), this is a meaningful gap. The Anthropic SDK's Files API + `document`/`image` content blocks can handle this — track as a Session 11+ candidate.
- **Prompt caching still off.** Both system prompts are under 500 tokens each, well below Sonnet 4.6's 2048-token minimum. A future extension (richer persona config, longer rule sets, few-shot examples) would push us over and justify `cache_control: {type: 'ephemeral'}` on the system block. `logUsage` already reports `cacheRead`/`cacheWrite` so the hit rate will be visible the moment it crosses.
- **Pre-existing React warning.** `EmailClientLive` message-list buttons mix `border: 'none'` with `borderLeft` — harmless but noisy in dev-mode console. Low-priority style cleanup; not Session 9 fallout.
- **Styling is inline everywhere.** The `AssistPanel` + `AssistButton` components are inline-styled to match the rest of the widget. Once the widget system moves to CSS modules or a design-token layer (not currently scoped), these should migrate alongside.
- **Single-company assumption.** The widget pulls `activeCompany` and uses it for every click. Multi-company orgs switching mid-session are handled by `useEffect([selected.threadId])` which resets panel state — but if `activeCompany` changes the panels hold their stale result until the user reselects a message. Minor edge case; revisit if it becomes user-visible.
- **No retry UI.** On `{ok: false, error: ...}` the panel shows the error but there's no retry button — user has to click Summarize/Draft again. One-liner to add a retry button; deferred in favor of shipping.

## Session 10 — Google Analytics (GA4) integration + shared Google OAuth

**Goal**: Bring the Analytics mode to parity with Communications / Finance — live GA4 data flowing into `TrafficChart`, `EngagementChart`, `PerformanceTable`, `TopPages`, `ConversionStats`, `BounceRate`, `ReferralSources`. First step in a multi-integration future: extract the Google OAuth primitives Gmail has been carrying since Session 6 into a shared module so GA4 (and any future Google-product) reuses them instead of forking.

**Locked scope agreed before build**: OAuth refactor bundled with the GA4 ship. Auto-pick the first GA4 property the user's account has access to (no picker UI in v1). Trailing 7d window for every widget. Reuse the existing analytics widgets — normalize GA4 responses into the exact shapes the widgets already wanted from mock data. Deferred: multi-property picker, date-range picker, real-time API, custom metric/dimension UI, sparklines/deltas beyond the "this week vs last week" ones already on the widgets.

### Architectural choices

- **Shared Google OAuth module is the seam.** `lib/integrations/google/fetch.ts` owns the scope-agnostic primitives (`buildAuthorizeUrl({state, redirectUri, scope})`, `exchangeCode`, `refreshAccessToken`, `revokeToken`) and `lib/integrations/google/tokens.ts` owns the generic `loadGoogleCredentials(companyId, service)` loader with transparent refresh. Gmail's `buildAuthorizeUrl` is now a one-liner that injects `GMAIL_SCOPES`; GA4's connect route calls the shared function with `GA_SCOPES` directly. Same OAuth client ID + secret (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) covers both products — one client in Google Cloud Console handles both with per-service redirect URIs added to its Authorized Redirect URIs list.
- **Per-service token wrappers stay thin.** `lib/integrations/gmail/tokens.ts` and `lib/integrations/ga/tokens.ts` are now mostly encrypt-on-save + a rename on load (Gmail's `accountIdentifier` → `emailAddress`, GA's → `propertyResourceName`). The refresh-and-persist loop lives once in the shared loader. No duplication, no drift risk.
- **Property storage uses the existing schema.** The GA4 property resource name (`properties/123456789`) lives in the `account_identifier` column — same shape Gmail uses for the mailbox email. The human-readable display name lives in `account_label` (shown in the chip popover). No schema migration needed; the `metadata` JSON column stays unused for now.
- **Auto-pick the first property.** On the OAuth callback we call `accountSummaries.list` (Admin API), flatten the tree into a `{resourceName, displayName}` list, and take `[0]`. If the user has five GA4 properties, we pick whichever Google returns first. A multi-property picker is a Session 10.5 candidate — the storage model already supports a per-connection property ID, so the picker just needs UI + a server action to update it.
- **Seven parallel `runReport` calls, one cache entry.** `lib/integrations/ga/snapshot.ts` fires seven reports in parallel (daily traffic, daily engagement, daily bounce, top pages, referrals, headline current week, headline previous week) and caches the assembled `AnalyticsSnapshot` for 5 minutes. Headline metrics run as two separate single-row reports rather than one two-date-range report — simpler response parsing, no special-case `dateRange` dimension column to key into.
- **Widget shapes stay stable; normalizer adapts.** The existing widgets expected `{trafficBars, topPages, conversionRate, bounceRate, avgSession, ...}` from mock. The new `AnalyticsSnapshot` shape in `lib/integrations/analytics/model.ts` is a superset — widgets read `snapshot?.trafficBars ?? mock.trafficBars` and flip the live indicator via `markLive()` when snapshot is present. No widget logic branches except on null. This matches the Communications pattern from Session 6.
- **MetricWithDelta is pre-formatted.** Display-ready strings (`"3.8%"`, `"2m 14s"`, `"+14%"`) are computed in the normalizer, not in the widget. Widgets stay dumb; anyone adding a new widget that wants a different format has to ask for it from the snapshot rather than parse `.rawValue`. Raw numbers are also exposed on `MetricWithDelta.rawValue` for charts that need math.
- **GA4-specific quirks handled once.** `bounceRate` and `engagementRate` come back as 0–1 ratios (not 0–100 percents); converted in the normalizer. `date` dimension comes back as `YYYYMMDD` strings; converted to three-letter weekday labels in the normalizer. `averageSessionDuration` comes back in seconds; formatted as `"Xm YYs"` in the normalizer. The widgets never see raw GA4 shapes.
- **Null is a first-class degraded mode (Session 6–9 pattern, carried forward).** No credentials → null. Any `runReport` failure → caught, row marked `error` with the message, returns null. Empty `rows` → returns a snapshot with empty arrays (widgets render a friendly "No page data in the last 7 days" rather than crashing). Same "live or mock" switch the rest of the app already uses.

### New infrastructure files

| File | Purpose |
|---|---|
| `lib/integrations/google/fetch.ts` | Shared Google OAuth primitives: `buildAuthorizeUrl({state, redirectUri, scope})`, `exchangeCode`, `refreshAccessToken`, `revokeToken`, `GoogleTokenResponse`. Reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. |
| `lib/integrations/google/tokens.ts` | Shared loader `loadGoogleCredentials(companyId, service)` — returns a fresh access token + the row's `account_identifier`, refreshing silently if inside the 60 s expiry skew. `loadGoogleRefreshToken` for disconnect flows. |
| `lib/integrations/ga/fetch.ts` | GA4 API wrappers: `listAccountSummaries` + `flattenProperties` (Admin API, used once at connect time) and `runReport` (Data API, used per snapshot). `GA_SCOPES` constant. Typed request/response shapes for Data API reports. |
| `lib/integrations/ga/tokens.ts` | `saveGoogleAnalyticsCredentials`, `loadGoogleAnalyticsCredentials`, `loadGoogleAnalyticsRefreshToken`, `getGoogleAnalyticsAccountRow`, `markGoogleAnalyticsDisconnected/Error`, `GOOGLE_ANALYTICS_SERVICE` constant. Thin wrappers around the shared Google helpers. |
| `lib/integrations/ga/normalize.ts` | `assembleSnapshot` + per-report extractors (`extractDailySessions`, `extractDailyEngagement`, `extractDailyBounceRate`, `extractTopPages`, `extractReferralSources`, `buildHeadlineMetrics`). Converts GA4 0–1 ratios to 0–100 percents, `YYYYMMDD` to weekday labels, seconds to `"Xm YYs"`, raw numbers to display-ready strings with deltas. |
| `lib/integrations/ga/snapshot.ts` | `getAnalyticsSnapshot(companyId)` — fires seven parallel `runReport` calls, assembles, caches as `ga:snapshot:{companyId}` for 5 min. `invalidateAnalyticsSnapshot` for disconnect. |
| `lib/integrations/analytics/model.ts` | `AnalyticsSnapshot`, `DailyDatum`, `TopPageDatum`, `ReferralDatum`, `MetricWithDelta`. The shape every analytics widget reads. |
| `lib/integrations/analytics/read.ts` | `'use server'` — `readAnalyticsSnapshot(companyId)` with `requireCompanyAccess` guard. |
| `app/api/integrations/google_analytics/connect/route.ts` | Issues signed state, builds authorize URL with GA_SCOPES, redirects. Mirrors Gmail's connect route. |
| `app/api/integrations/google_analytics/callback/route.ts` | Verifies state, exchanges code, lists GA4 properties, auto-picks the first, saves encrypted tokens + property resource name + display name, invalidates snapshot cache, redirects to `/analytics`. |
| `hooks/use-google-analytics-connection.ts` | `useGoogleAnalyticsConnectionStatus(companyId)` + `getGoogleAnalyticsConnectUrl(companyId)`. |
| `components/integrations/google-analytics-connection-chip.tsx` | Three-state chip (not_connected / connected / error) with detail popover, Reconnect + Disconnect buttons. |
| `contexts/analytics-snapshot-context.tsx` | `AnalyticsSnapshotProvider` + `useAnalyticsSnapshot()`. Client context that loads the snapshot for the active company. |

### Files modified

| File | Change |
|---|---|
| `lib/integrations/gmail/fetch.ts` | Stripped ~130 lines of Google OAuth primitives. Now imports + re-exports them from `lib/integrations/google/fetch.ts`, keeping only Gmail-specific `buildAuthorizeUrl` (wraps shared fn with `GMAIL_SCOPES`), `getGmailProfile`, `listMessages`, `listThreads`, `getMessage`, `getThread`. The Gmail connect + callback routes continue to import from this file without knowing the refactor happened. |
| `lib/integrations/gmail/tokens.ts` | `loadGmailCredentials` is now a 4-line wrapper over `loadGoogleCredentials(companyId, 'gmail')`. `loadGmailRefreshToken` is a 1-line wrapper. Save-side and status helpers unchanged. |
| `lib/integrations/actions.ts` | `revokeToken` import moved from `gmail/fetch` to `google/fetch` (now the canonical home). Added `getGoogleAnalyticsStatus` + `disconnectGoogleAnalytics` — same shape as the Gmail equivalents. |
| `components/widgets/content/analytics-widgets.tsx` | Rewrote every widget to pull from `useAnalyticsSnapshot()`. Shared `useLiveSnapshot()` helper flips `markLive()` when present. Mock fallback inline on each widget (same pattern Communications uses). `BounceRate` domain made dynamic (was hardcoded 35–55). `TopPages` renders a friendly empty state when live data has no pages. |
| `app/(app)/analytics/page.tsx` | Wrapped in `AnalyticsSnapshotProvider`. Renders `GoogleAnalyticsConnectionChip` in the top-right, same layout as `/communications`. |

### Google Cloud Console prerequisites

Three changes the user controls, required once before the first real connection:

1. **Authorized Redirect URIs** (OAuth client, Credentials page): add both `http://localhost:3001/api/integrations/google_analytics/callback` (dev) and `https://<production-domain>/api/integrations/google_analytics/callback` (Vercel).
2. **Consent screen Data Access** (Google Auth Platform): add `https://www.googleapis.com/auth/analytics.readonly`. Without this, consent screen fails validation at authorize time.
3. **Enable APIs** in the Cloud project: **Google Analytics Data API** AND **Google Analytics Admin API**. The connect route hits the Admin API (`accountSummaries.list`) at callback time; the snapshot hits the Data API (`properties/{id}:runReport`). Both have their own enablement toggle.

No env vars added — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are shared with Gmail.

### Local verification

- `tsc --noEmit` clean across the full codebase after the refactor + new module. Gmail connect / callback / snapshot / widgets all continue to compile against the thinned `lib/integrations/gmail/fetch.ts` (because the OAuth exports are re-exported).
- `/analytics` loaded in dev; widgets render with mock fallback because the user has not yet connected GA4. "Sample data" indicator visible on each widget. `GoogleAnalyticsConnectionChip` renders with the "Connect Google Analytics" call-to-action in the top-right. No console errors, no server errors.
- Gmail side: `/communications` loaded after the refactor, snapshot cache still works, triage + response-stats + summaries + drafts all behave identically. No observable regression from the OAuth extraction.
- OAuth round-trip itself NOT verified end-to-end — Google Cloud Console prerequisites above need the user's action. Once the three changes are live, the flow is: click Connect → consent → callback lists properties → first property's resource name + display name saved → redirect to `/analytics?integration=google_analytics&status=connected` → snapshot fires → widgets flip live.

### Residuals heading into Session 11

- **Multi-property picker.** Auto-picking `[0]` is the simplest-sane default. If the user has multiple GA4 properties, they currently have no way to swap to a different one without disconnecting + reconnecting (and even that just re-picks `[0]`). A picker UI would call `listAccountSummaries` on demand, show the list, and update `account_identifier` in-place. Storage + fetch already support it; only the UI is missing.
- **No date-range picker.** Trailing 7d is hardcoded in every `runReport` request. The widgets' shapes are range-agnostic, so this is purely UI + server-action plumbing. Expected ask as soon as the user actually looks at data.
- **Real-time API not used.** GA4 has a separate `runRealtimeReport` for last-30-min data — not called in v1. Useful for a future "Active users right now" tile; low priority since nothing on the current widget grid needs sub-minute freshness.
- **`services.ts` OAUTH_SCOPES still carries a stale `userinfo.email` entry for Gmail.** That map is only consumed by the legacy `/[service]/connect` handler — my hardened Gmail + GA routes use the constants in `gmail/fetch.ts` and `ga/fetch.ts` directly, so no runtime bug. Flagged as drift; fix when the next of the legacy services (Outlook / LinkedIn / Facebook / QuickBooks) migrates to the hardened pattern.
- **Admin API call happens inline on the OAuth callback.** Adds ~500 ms to the first-connect redirect. Fine at human UI timescales; if we ever start issuing M2M credentials where latency matters, move property discovery to a background job and land the user on `/analytics` immediately with an "Auto-picking your property…" spinner.
- **Cache is still in-memory** (Session 6+ carry-over). `ga:snapshot:{companyId}` evaporates on Vercel redeploy along with everything else under the `CacheStore` interface. The Redis/Upstash swap now has four consumer namespaces (`gmail:snapshot:*`, `gmail:triage:*`, `gmail:response-stats:*`, `gmail:thread-context/summary`, `ga:snapshot:*`) — same swap, wider win.
- **No shared "connection chip" component.** `GmailConnectionChip` and `GoogleAnalyticsConnectionChip` are ~95 % identical. A generic `ConnectionChip` taking service + hook + label + disconnect fn as props would DRY them — but it'd turn into a props-soup for borderline benefit. Revisit when a third chip lands (Outlook, probably).
- **No end-to-end live verification yet.** Needs user to complete the three Google Cloud Console prerequisites. Once done, a single connect click should flip every analytics widget live; record a log line `[ga] snapshot built …` style (not yet emitted — add if the first live run needs observability).
- **GA4 admin throttling unmonitored.** `accountSummaries.list` has a modest per-user quota. Only called once per connect, so unlikely to hit — but worth watching in the logs when the first few real connects happen.

## Session 11 — Etsy integration (vertical slice: OAuth + OrderStats live)

**Goal**: Flip commerce mode's headline tile from mock to live by shipping a hardened Etsy OAuth + a `CommerceSnapshot` that powers the `OrderStats` widget. First non-Google provider on the hardened pattern — proves the shape works for PKCE-mandatory clients with rotating refresh tokens and non-bearer auth headers. Remaining five commerce widgets (Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct) stay on `COMMERCE_MOCK` until a follow-up session expands the snapshot to include listings + a richer receipt feed.

**Locked scope agreed before build**: Vertical slice — OAuth + connect chip + snapshot + a single widget (`OrderStats`) live. No feature flag (user is sole user during Etsy's app-approval review). No multi-shop picker (Etsy enforces one shop per user). Trailing 30-day window on the receipts report.

### Architectural choices

- **No reuse of the Google OAuth module.** Etsy's auth/token endpoints are different, it mandates PKCE on every flow, it rotates refresh tokens on every refresh (the new refresh_token must replace the old one), and every Open API v3 call needs an `x-api-key: <ETSY_CLIENT_ID>` header alongside the bearer token. Trying to abstract Google + Etsy behind a single primitive would mean conditional branches everywhere; keeping the Etsy helpers self-contained under `lib/integrations/etsy/` is the simpler seam.
- **PKCE verifier lives in an HTTP-only cookie, not in the state token.** Our existing `oauth-state.ts` is HMAC-signed but the payload is plaintext base64url — visible in URLs, logs, and referrer headers. A verifier there would leak. Instead, we write `etsy_pkce_<key>` as an HTTP-only, path-scoped (`/api/integrations/etsy`), 10-minute cookie, where `<key>` is the first 16 hex chars of `sha256(state)`. Both sides have the state token (connect just issued it, callback receives it as a query param), so the derived key is deterministic without exposing the nonce. No change to `oauth-state.ts`, which keeps Gmail + GA untouched.
- **Access-token prefix is the user_id.** Etsy access tokens are formatted `{user_id}.{opaque}`. `extractUserIdFromToken()` parses the prefix so shop discovery (`GET /v3/application/users/{user_id}/shops`) doesn't need an extra round-trip to a profile endpoint.
- **One shop per user, so no picker.** Etsy enforces this at the account level; the discovery endpoint returns a single shop object (not a list). If the user hasn't opened a shop, discovery returns 404 — we catch that and redirect with `?status=error&reason=No Etsy shop found…` rather than saving an empty connection.
- **`account_identifier` stores `shop_id`, `account_label` stores `shop_name`, `metadata.currency_code` stores the ISO 4217 code.** Same schema pattern Gmail (email) and GA4 (property resource name) already use. The currency lives in metadata because the receipts endpoint doesn't echo it back; caching it at connect time avoids a shop re-fetch on every snapshot refresh.
- **Pagination hard-capped at 500 receipts.** `listShopReceipts` pages at 100 per call for up to 5 pages. Enough for any reasonable small-business volume over a 30-day window; bounded worst-case for pathologically active shops so the snapshot doesn't spin.
- **`CommerceSnapshot.orderStats` is a superset of what `OrderStats` displays.** Widget reads `snapshot?.orderStats?.totalOrders ?? c.totalOrders` with the same null-is-mock pattern every other mode uses. `markLive()` flips when the snapshot is present — the "Sample data" badge goes away automatically.
- **Currency formatting is pre-baked in the normalizer.** `totalRevenue` arrives as a display-ready string ("$9,340.00" or "9,340.00 XYZ" for unknown codes). Widget stays dumb; any future widget that needs a different format asks for it from the snapshot.
- **Null is a first-class degraded mode (Session 6+ pattern carried forward).** No credentials → null. Any provider error → caught, row marked `error`, snapshot returned null, widget falls back to mock. The "Sample data" badge plus the chip's error state are the user-visible feedback.
- **No Etsy revoke endpoint.** Etsy doesn't document an OAuth revoke. Disconnect drops our copy and invalidates the cache; the refresh token ages out of Etsy's 90-day window on its own. That's the most we can promise without public-domain tooling.

### New infrastructure files

| File | Purpose |
|---|---|
| `supabase/migrations/20260420000000_add_etsy_service.sql` | Widens `connected_accounts.service` check constraint to include `'etsy'`. |
| `lib/integrations/etsy/fetch.ts` | Etsy-specific OAuth + API primitives: `ETSY_SCOPES` (`transactions_r shops_r`), `generatePkce()`, `buildAuthorizeUrl`, `exchangeCode`, `refreshAccessToken`, `extractUserIdFromToken`, `getUserShop`, `listShopReceipts`. Typed `EtsyReceipt` / `EtsyShop`. |
| `lib/integrations/etsy/tokens.ts` | `saveEtsyCredentials`, `loadEtsyCredentials` (with transparent refresh that persists the rotated refresh_token), `loadEtsyRefreshToken`, `getEtsyAccountRow`, `markEtsy{Disconnected,Error}`, `ETSY_SERVICE`. |
| `lib/integrations/etsy/pkce-cookie.ts` | `stateCookieKey()` (sha256-derived key from the state token), `writePkceCookie`, `readPkceCookie`, `clearPkceCookie`. HTTP-only, `/api/integrations/etsy`-scoped, 10 min. |
| `lib/integrations/etsy/normalize.ts` | `buildOrderStats()` — filters to non-canceled receipts in the window, computes totalOrders / newOrders / processingOrders / shippedOrders, sums `grandtotal` for paid receipts into a formatted currency string, computes `fulfillmentRate` as shipped/total. |
| `lib/integrations/etsy/snapshot.ts` | `getCommerceSnapshot(companyId)` — paginates `listShopReceipts`, assembles, caches as `etsy:snapshot:{companyId}` for 5 min. `invalidateCommerceSnapshot` for disconnect/callback. |
| `lib/integrations/commerce/model.ts` | `CommerceSnapshot` + `OrderStats` shape. V1 only populates `orderStats`; room to add `products`, `ordersKanban`, etc. in Session 12. |
| `lib/integrations/commerce/read.ts` | `'use server'` — `readCommerceSnapshot(companyId)` with `requireCompanyAccess` guard. |
| `app/api/integrations/etsy/connect/route.ts` | Validates company access, generates PKCE, issues signed state, writes PKCE cookie keyed by `sha256(state)`, redirects to Etsy. |
| `app/api/integrations/etsy/callback/route.ts` | Verifies state + ownership, recovers PKCE verifier from cookie (clears unconditionally), exchanges code, resolves shop via `users/{user_id}/shops`, saves encrypted tokens + `currency_code` in metadata, invalidates snapshot cache, redirects to `/commerce`. |
| `hooks/use-etsy-connection.ts` | `useEtsyConnectionStatus(companyId)` + `getEtsyConnectUrl(companyId)`. |
| `components/integrations/etsy-connection-chip.tsx` | Three-state chip (not_connected / connected / error) + detail popover with Reconnect + Disconnect. |
| `contexts/commerce-snapshot-context.tsx` | `CommerceSnapshotProvider` + `useCommerceSnapshot()`. Client context that loads the snapshot for the active company on mount. |

### Files modified

| File | Change |
|---|---|
| `lib/types/database.types.ts` | Added `'etsy'` to the `service` union on both `Row` and `Insert` shapes of `connected_accounts`. |
| `lib/integrations/actions.ts` | Added `getEtsyStatus` + `disconnectEtsy` (same shape as Gmail/GA equivalents, minus the provider-side revoke step since Etsy doesn't expose one). |
| `components/widgets/content/commerce-widgets.tsx` | `OrderStats` now reads `useCommerceSnapshot()` with `markLive()` on snapshot presence. Live values null-coalesce into the mock defaults — other commerce widgets (Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct) are untouched and continue reading `COMMERCE_MOCK`. |
| `app/(app)/commerce/page.tsx` | Wrapped in `CommerceSnapshotProvider`. Renders `EtsyConnectionChip` in the top-right, same layout as `/analytics`. |

### Etsy app settings + env prerequisites

User-controlled, required once before the first real connect attempt:

1. **Authorized Redirect URIs** in the Etsy app settings: both `http://localhost:3001/api/integrations/etsy/callback` (dev) and `https://<production-domain>/api/integrations/etsy/callback` (Vercel).
2. **Env vars**: `ETSY_CLIENT_ID=<keystring>` + `ETSY_CLIENT_SECRET=<shared_secret>` in `.env.local` and in Vercel project settings.
3. **Database migration**: apply `20260420000000_add_etsy_service.sql` to the Supabase project (or rely on whatever migration-apply workflow is in use).

No scopes outside `transactions_r shops_r` — anything else would expand the consent screen.

### Local verification

- `tsc --noEmit` clean across the full codebase after all new files + the widget + page + actions edits.
- `/commerce` loaded in dev with the feature disconnected: "Connect Etsy" chip renders in the top-right in the `EF9F27` accent color, `OrderStats` falls back to mock values (47 / $9,340 / 94% / 12) with the "Sample data" indicator visible. All other commerce widgets unchanged. No regressions in the rest of the app (Gmail, GA4, Stripe chips/snapshots all still work).
- OAuth round-trip itself NOT verified end-to-end — blocked on the user configuring Etsy app callback URLs + `.env.local` values + running the new migration. Once those three are in place, a click on "Connect Etsy" should: redirect → Etsy consent → callback → auto-resolve shop → save → redirect to `/commerce?integration=etsy&status=connected` → snapshot fires → OrderStats flips live.

### Residuals heading into Session 12

- **Five commerce widgets still on mock.** Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct all read `COMMERCE_MOCK` verbatim. Filling them needs an Etsy listings feed (`GET /v3/application/shops/{shop_id}/listings?state=active` for product + stock data) and a transactions-vs-receipts pass to populate recent-activity events. The snapshot shape is a superset, so it's additive — widgets flip one at a time without touching OAuth.
- **No OAuth-error banner on `/commerce?integration=etsy&status=error&reason=...`.** Same residual called out for `/analytics` in Session 10. The callback redirects with structured query params; the mode page silently ignores them. A generic client-side banner that reads `?integration`/`?status`/`?reason` and shows a dismissible toast would serve every integration.
- **No shop picker / no shop swap.** Etsy enforces one shop per user so this is less of a gap than GA4's multi-property case — but if a user ever wants to swap Etsy accounts they currently need to disconnect + reconnect. Fine for v1.
- **PKCE cookie collides on concurrent connect flows.** Unlikely in practice (user has to click Connect twice in two tabs within 10 minutes for the same state hash to collide, and our derived key is 64 bits of sha256 entropy), but worth noting: the cookie is keyed per state, so two live flows simply write + read distinct cookie slots. Only a pathological attacker crafting collisions matters, which requires the OAuth state secret.
- **`CommerceSnapshot.orderStats.newOrders === processingOrders`.** Etsy conflates "paid but not shipped" into a single bucket; the snapshot exposes both fields for widget symmetry with `COMMERCE_MOCK`, but they're identical in live data. When the widgets expand, this field should either be removed or repurposed (e.g. `processingOrders` = `status === 'payment processing'` which is a transient state for credit-card captures).
- **No log line on snapshot build.** Same call-out as GA4 Session 10 — fine until observability becomes a felt need.
- **Cache is still in-memory** (Session 6+ carry-over). Adds another namespace: `etsy:snapshot:*`. Redis/Upstash swap now has five consumer namespaces.
- **Etsy app is pending approval at shipping time.** Dev keystring + secret work against the sandbox, but other users can't go through the consent screen until Etsy approves the app. User is sole user during the review window.
- **`EtsyConnectionChip` is the third ~95%-identical chip.** The Session 10 residual called for revisiting a generic chip when a third provider landed. Still holding off — the props-soup cost outweighs the duplication cost so long as chip count is small. Worth a ~1-hr extract when Outlook lands (the fourth).
- **Etsy rate limits unmonitored.** Etsy v3 enforces 10 req/s per app and 10 000 req/day per app. Our snapshot fires at most 5 requests per build and caches for 5 min, so a single company hits the endpoint ~1 req/min when actively viewing `/commerce`. Well under the envelope; worth a log if the first live run surfaces anything unexpected.

---

## Session 11.1 — Fix Etsy v3 `x-api-key` format

First live OAuth attempt revealed that Etsy's v3 API rejects the keystring-only `x-api-key` header documented in older references. Every request returned `403 {"error":"Shared secret is required in x-api-key header."}` even though the OAuth code exchange (which sends the same keystring as `client_id`) had succeeded.

Six header-shape variants against `openapi-ping` ruled out everything else and confirmed the actual requirement: `x-api-key` must be **`{keystring}:{shared_secret}`** (colon-joined). Sending the secret alone returns `"API key not found or not active"`; sending nothing returns the literal hint `"Invalid API key: should be in the format 'keystring:shared_secret'"`.

### Changes

| File | Change |
|---|---|
| `lib/integrations/etsy/fetch.ts` | `etsyApiGet` now sends `'x-api-key': ` `${clientId()}:${clientSecret()}`. Inline comment captures the deviation from older docs. |

End-to-end verified after the change: OAuth callback resolves the shop (`DigitalDreamsmiths`, USD), tokens persist, snapshot builds, `OrderStats` flips live and the "Sample data" badge drops off.

---

## Session 12 — Commerce snapshot expansion (Products, OrdersKanban, RecentActivity, LowStock, RevenueByProduct go live)

**Goal**: Flip the remaining five commerce widgets from `COMMERCE_MOCK` to real Etsy data. The user pointed out that "Starter Kit," "Widget Pro," "Order #1847," etc. don't exist in their actual shop — those were all mock holdovers that Session 11 explicitly deferred. Session 12 closes that gap so every widget on `/commerce` reflects the real seller's state.

### Locked scope

- One new Etsy endpoint: `GET /v3/application/shops/{shop_id}/listings/active` for products + stock.
- Same trailing 30-day receipts call as Session 11, now with `?includes=Transactions` so we get per-line-item data for the revenue-by-product breakdown.
- All five remaining widgets flip live with the same null-is-mock fallback pattern (`useLiveMark`).
- LowStock threshold stays at `< 20` units (matches the prior mock filter).
- `OrdersKanban` semantics shift: `new` = open/unpaid, `processing` = paid + unshipped, `shipped` = was_shipped. Closer to how a real seller thinks about the queue than the prior "all paid in 'new'" mock.
- No multi-page listings beyond 3 pages (300 listings) — covers any reasonable Etsy seller without unbounded paging.
- No new env vars, no migration, no provider changes.

### New / extended infrastructure

| File | Change |
|---|---|
| `lib/integrations/etsy/fetch.ts` | Adds `EtsyListing` + `EtsyTransaction` types, exports `EtsyMoney`, adds `listActiveListings()`, adds `includeTransactions` option to `listShopReceipts` (sets `?includes=Transactions`), exports `moneyToNumber()` helper. |
| `lib/integrations/commerce/model.ts` | Expanded `CommerceSnapshot` with `products`, `ordersKanban`, `recentActivity`, `lowStock`, `revenueByProduct`. New types: `Product`, `OrderCard`, `OrdersKanban`, `ActivityEntry`, `ActivityType`, `RevenueByProductEntry`. Outdated "V1 only populates orderStats" comment removed. |
| `lib/integrations/etsy/normalize.ts` | Adds `buildProducts`, `buildLowStock`, `buildOrdersKanban`, `buildRecentActivity`, `buildRevenueByProduct`. Shared currency formatting (`formatMoney`, `formatCurrencyUnits`) handles JPY's no-decimal convention. New relative-time formatter for activity entries (`just now` → `min ago` → `h ago` → `Yesterday` → `Nd ago` → `Nw ago` → `Nmo ago`). Includes a synthetic "Low stock alert" entry when the tightest low-stock product exists, surfaced in `recentActivity` for parity with the prior mock event mix. |
| `lib/integrations/etsy/snapshot.ts` | Fetches receipts + listings in parallel via `Promise.all`. New `collectListings()` helper paginates listings (3-page cap = 300 listings). Builds all six snapshot sections. Same 5-minute TTL, same cache key (`etsy:snapshot:{companyId}`). |
| `components/widgets/content/commerce-widgets.tsx` | All five widgets re-wired to read from `useCommerceSnapshot()` with mock fallback. New `useLiveMark` helper hook consolidates the `useEffect(() => { if (value != null) markLive() })` boilerplate. Empty-state strings ("No active listings.", "No recent activity in the last 30 days.", "No revenue in the last 30 days.", "All products well stocked.") render when the live snapshot has an empty array — preventing the previous fallback-to-mock-on-empty UX. |

### Architectural choices

- **Listings fetched in parallel with receipts.** The two endpoints don't depend on each other; the prior serial design left ~600 ms of round-trip on the table. `Promise.all` halves the snapshot build time. If either throws, the snapshot returns `null` (existing pattern) and the widgets fall back to mock.
- **Transactions embedded, not separately fetched.** Etsy supports `?includes=Transactions` on the receipts endpoint, returning each receipt's line items inline. The alternative — a per-receipt transactions call — would multiply the request count by N receipts and burn the rate-limit budget on a hot shop. One flag, same call count.
- **Empty live data ≠ mock data.** Earlier draft of the widget hooks fell back to mock whenever the live array was empty. That hid the truth (e.g. "0 paid orders" looked like "$9,340 in sample revenue"). Switched to: live snapshot present + empty array → empty-state text. Mock only renders when the snapshot itself is null (provider not connected / error / not yet loaded).
- **OrderCard ids are stringified Etsy receipt_ids, not display numbers.** The mock used cosmetic `#1847`, `#1851` IDs; live data uses `#4069855475`. Long but unambiguous; widget styling truncates with overflow rather than re-numbering. Renumbering would mean stateful counters per company, which the snapshot deliberately avoids.
- **`buildRecentActivity` includes a synthetic low-stock alert.** Mock used to mix order events with a low-stock alert; live data with no low-stock items just produces 4 order events. The synthetic entry matches the prior visual rhythm when stock is tight, costs nothing when stock is healthy.
- **`COMMERCE_MOCK` still ships.** Used both as fallback for disconnected/error states and as the initial render before the snapshot loads. Removing it would mean a blank `/commerce` for unconnected companies — worse onboarding than seeing plausible placeholder data.

### Local verification

- `tsc --noEmit` clean across the codebase.
- `/commerce` for `ce650d4b-...` (the connected company) renders:
    - **Order Stats**: 4 / $0.00 / 0% / 0 — accurate for a shop with 4 open/unpaid orders.
    - **Products**: 6 real listings (Puppy Coloring Book $8.99 / Golden Doodle $2.99 / Dalmatian $2.99 / Yorkshire Terrier $2.99 / Mug Wrap $8.99 / Valentine Alphabet $12.99) with real stock counts (150–249 units each).
    - **Orders Kanban**: 4 entries in `new` (`#4069855475 $3.29`, `#4061850432 $3.27`, `#4065778851 $3.27`, `#4052276376 $2.24`); `processing` and `shipped` render `—` (no paid-yet-unshipped or shipped orders).
    - **Recent Activity**: 4 pending-order entries, newest first (`2d ago`, `4d ago`, `6d ago`, `2w ago`).
    - **LowStock**: empty array → "All products well stocked." (correct — digital products with 150+ units).
    - **RevenueByProduct**: empty array → "No revenue in the last 30 days." (correct — no paid receipts).
- Snapshot dump via temporary `/api/integrations/etsy/debug-snapshot` confirmed all sections are populated coherently; route deleted post-verification.
- Mock fallback verified on disconnected companies and on the analytics/marketing/etc. modes (unchanged from Session 11).

### Residuals heading into Session 13

- **OrderCard ids look ugly.** 10-digit Etsy receipt IDs (`#4069855475`) crowd the kanban cards. Either (a) trim to last-4 with hover/tooltip for the full id, or (b) compute a per-company-monotonic receipt number on read. (b) requires a sidecar table to track issued numbers; (a) is the smaller change.
- **`recentActivity` synthetic alert is dishonest about timing.** It uses `now` instead of an actual event timestamp. Either tag it explicitly (`time: 'now'` is already there, which renders fine, but the alert can outrank a real event timestamped a few seconds ago). Fine for now since real users won't have ties at the second-level.
- **No category/SKU on `Product`.** Etsy returns much richer metadata (categories, tags, images) that the dashboard could surface in a product-detail click-through. The current `Product` shape is widget-display only.
- **`LowStock` threshold is hardcoded.** Different sellers care about different thresholds; should eventually move into per-company settings.
- **`RevenueByProduct` window is the same 30 days as the rest of the snapshot.** A "lifetime top sellers" view would need a separate longer query (or a periodic background aggregation). Not blocking v1.
- **Listings pagination caps at 300.** Sellers with > 300 active listings will see only the first 300 in the Products / RevenueByProduct join. Most Etsy shops are below this; raise the cap if a real user hits it.
- **No log line on snapshot build (still).** Carried forward from Sessions 10 and 11.
- **`EtsyConnectionChip` still the only ~95%-identical chip standout.** Generic chip extraction still on hold for the same reason as Session 11 — the props-soup cost outweighs the duplication cost until Outlook (provider #4) lands.
- **Cache is still in-memory.** Same Redis/Upstash swap residual as before, now with the snapshot carrying considerably more payload (a few hundred-K vs Session 11's tens-of-K).

---

## Session 13 — LinkedIn OAuth (identity-only foundation; widgets remain on mock)

**Goal**: Plant the OAuth + connection-chip foundation for the Marketing mode's first integration. LinkedIn's dev-mode API is significantly more restrictive than Etsy's: the only universally-available scopes (`openid profile email`) give us identity (name, picture, email) but NOT post / share data. So v1 ships the connection chip and stores the access token; the existing five marketing widgets stay on `MARKETING_MOCK` with "Sample data" badges until a follow-up session — after the LinkedIn app gets approved for Marketing Developer Platform scopes — wires real post data.

### Locked scope

- OAuth round-trip + PKCE, identity-tier scopes only (`openid profile email`).
- New `linkedin` value in the `connected_accounts.service` enum (distinct from the placeholder `linkedin_page` that the initial schema reserved for the eventual company-page integration).
- Connect chip on `/marketing` (top-right, marketing-mode coral). Same three states as the Etsy / GA4 / Gmail chips.
- **No live widget yet.** All five marketing widgets continue reading `MARKETING_MOCK`. The chip is the only visible affordance of the integration in this session.
- No `MarketingSnapshot` model file — deferred until the post-approval session can populate it with real shapes (publishedPosts, recentPosts, engagementTrend, etc.).

### Architectural choices

- **No reuse of the Google OAuth module.** Same reasoning as Etsy: distinct auth endpoints, distinct refresh-token semantics (member-tier doesn't issue a refresh token at all), no shared API base. Keeping `lib/integrations/linkedin/` self-contained is simpler than threading conditionals through the Google helper.
- **PKCE verifier lives in an HTTP-only cookie keyed by sha256(state).** Same pattern as Etsy. LinkedIn supports both the classic confidential-client flow and PKCE — we use PKCE because it makes the connect/callback shape symmetric across providers and lets us reuse the cookie-handling pattern without thinking.
- **Member-tier tokens have no refresh.** LinkedIn returns a ~60-day access token and NO refresh token for OIDC-only scopes. `loadLinkedInCredentials` therefore doesn't have a transparent-refresh branch; expired tokens are flagged as `error` and the user reconnects. Marketing Developer Platform scopes DO issue refresh tokens, but that's wired in the follow-up session.
- **`account_identifier` stores the LinkedIn `sub`, `account_label` stores the display name, metadata holds `picture_url` + `email`.** Matches the shape every other provider uses: identifier is stable + opaque, label is human-readable. Picture and email live in metadata so the chip popover can surface them in a follow-up without a schema migration.
- **Service value is `linkedin`, not `linkedin_page`.** The initial schema reserved `linkedin_page` for a future company-page integration; the member-tier OAuth we're shipping first is a distinct service from a separate app perspective (different scopes, different endpoints). The migration adds `linkedin` alongside the existing value so both can coexist if a future commercial-page integration ever lands without colliding on the same row.
- **No revoke endpoint on disconnect.** LinkedIn doesn't expose an OIDC-token revoke. Disconnect drops our copy of the token; the access token ages out of LinkedIn's 60-day window on its own.

### New infrastructure files

| File | Purpose |
|---|---|
| `supabase/migrations/20260524000000_add_linkedin_service.sql` | Adds `'linkedin'` to the `connected_accounts.service` check constraint. |
| `lib/integrations/linkedin/fetch.ts` | OAuth + OIDC API primitives: `LINKEDIN_SCOPES` (`openid profile email`), `generatePkce()`, `buildAuthorizeUrl`, `exchangeCode`, `getUserinfo`. Typed `LinkedInTokenResponse` / `LinkedInUserinfo`. |
| `lib/integrations/linkedin/tokens.ts` | `saveLinkedInCredentials`, `loadLinkedInCredentials` (no transparent refresh), `getLinkedInAccountRow`, `markLinkedIn{Disconnected,Error}`, `LINKEDIN_SERVICE`. |
| `lib/integrations/linkedin/pkce-cookie.ts` | `stateCookieKey()` (sha256-derived key from the state token), `writePkceCookie`, `readPkceCookie`, `clearPkceCookie`. HTTP-only, `/api/integrations/linkedin`-scoped, 10 min. |
| `app/api/integrations/linkedin/connect/route.ts` | Validates company access, generates PKCE, issues signed state, writes PKCE cookie keyed by `sha256(state)`, redirects to LinkedIn's consent screen. |
| `app/api/integrations/linkedin/callback/route.ts` | Verifies state + ownership, recovers PKCE verifier from cookie (clears unconditionally), exchanges code, fetches `/v2/userinfo`, saves encrypted token + identity, redirects to `/marketing`. |
| `hooks/use-linkedin-connection.ts` | `useLinkedInConnectionStatus(companyId)` + `getLinkedInConnectUrl(companyId)`. |
| `components/integrations/linkedin-connection-chip.tsx` | Three-state chip (not_connected / connected / error) + detail popover with Reconnect + Disconnect. Renders in marketing-mode coral. |

### Files modified

| File | Change |
|---|---|
| `lib/types/database.types.ts` | Added `'linkedin'` to the `service` union on both `Row` and `Insert` shapes of `connected_accounts`. |
| `lib/integrations/actions.ts` | Added `getLinkedInStatus` + `disconnectLinkedIn` (same shape as Etsy/GA equivalents). |
| `app/(app)/marketing/page.tsx` | Renders `LinkedInConnectionChip` in the top-right above the widget grid. |

### LinkedIn app settings + env prerequisites

User-controlled, required once before the first real connect attempt:

1. **Authorized Redirect URLs** in the LinkedIn app's Auth tab: both `http://localhost:3001/api/integrations/linkedin/callback` (dev) and `https://<production-domain>/api/integrations/linkedin/callback` (Vercel).
2. **Products tab → enable "Sign In with LinkedIn using OpenID Connect".** Grants the three scopes (`openid`, `profile`, `email`) without app review.
3. **Env vars**: `LINKEDIN_CLIENT_ID=<client_id>` + `LINKEDIN_CLIENT_SECRET=<client_secret>` in `.env.local` and Vercel project settings.
4. **Database migration**: apply `20260524000000_add_linkedin_service.sql` to the Supabase project.

### Local verification

- `tsc --noEmit` clean across the codebase.
- `/marketing` loaded in dev with LinkedIn disconnected: chip renders in the coral marketing accent, all five widgets continue showing `MARKETING_MOCK` with their existing "Sample data" indicators. No regressions in other modes.
- OAuth round-trip NOT verified end-to-end at session-close — the LinkedIn app on the user's side hasn't been created yet (parallels Etsy Session 11's same blocker). When the four prereqs above are in place, a click on "Connect LinkedIn" should redirect to LinkedIn → consent → callback → save → redirect to `/marketing?integration=linkedin&status=connected` with the chip flipped to "LinkedIn connected".

### Residuals heading into Session 13.1 / future sessions

- **Five marketing widgets remain on `MARKETING_MOCK`.** Filling them requires LinkedIn approving the app for Marketing Developer Platform / Community Management API scopes — multi-week external review. Once approved, a session adds a `MarketingSnapshot` model, `lib/integrations/marketing/`, a `lib/integrations/linkedin/normalize.ts`, and wires the widgets the same way Session 12 wired commerce. Widget shapes already exist (`MARKETING_MOCK` is the spec).
- **No refresh-token handling.** When the 60-day access token expires, the user gets an `error` status and reconnects. Fine for v1; when post-data scopes land in the follow-up, those DO issue refresh tokens and `loadLinkedInCredentials` gains a refresh branch (same shape as `loadEtsyCredentials`).
- **`LinkedInConnectionChip` is the fourth ~95%-identical chip.** The Session 11/12 residual called for revisiting a generic chip when a fourth provider landed. We've now landed it. The duplication cost finally exceeds the abstraction cost — worth a ~1-hour extract pass as a standalone session: generic `<ProviderConnectionChip provider="linkedin" status={...} accentVar="--mode-accent" onConnect={...} onDisconnect={...} />` consumed by four thin wrappers.
- **No connection picture on the chip.** We persist `picture_url` and `email` in metadata but don't render them yet. Trivial to surface in the popover when the chip extraction lands.
- **No OAuth-error banner on `/marketing?integration=linkedin&status=error&reason=...`.** Same residual called out for Etsy and GA4. The generic-banner extraction would now cover four providers in one shot.

---

## Session 13.1 — Drop PKCE from LinkedIn OAuth (confidential-client flow)

First live LinkedIn connect attempt returned `401 invalid_client: "Client authentication failed"` at the token exchange. LinkedIn rejects the combination of PKCE (`code_verifier`) + `client_secret` for confidential clients — one or the other is permitted, not both. Our server-side app has the secret, so the documented pattern is the confidential-client flow without PKCE.

### Changes

| File | Change |
|---|---|
| `lib/integrations/linkedin/fetch.ts` | Dropped `code_challenge` from `buildAuthorizeUrl`, dropped `code_verifier` from `exchangeCode`, removed `generatePkce()` + PKCE types. |
| `app/api/integrations/linkedin/connect/route.ts` | No longer generates PKCE or writes the verifier cookie. |
| `app/api/integrations/linkedin/callback/route.ts` | No longer reads the PKCE cookie. The signed state token alone handles CSRF. |
| `lib/integrations/linkedin/pkce-cookie.ts` | Deleted (no longer referenced). |

End-to-end verified after the change: consent → callback → token exchange (200) → `/v2/userinfo` → row upsert → chip flips to "LinkedIn connected" in green.

---

## Session 14 — Dashboard cross-cutting summary

**Goal**: Light up the only mode that still had zero integration. The Dashboard reads from every other mode's existing snapshot to surface a unified headline view — one pill per connected provider (`emails / orders / revenue / visits`), a setup checklist that knows the live state of all five providers, and a "live pulse" feed sourced from the commerce snapshot's `recentActivity`.

### Locked scope

- New `DashboardSnapshot` aggregator that re-uses the existing per-mode snapshots — no new provider API calls.
- `IntelligenceBriefing` widget pills flip from static placeholders to real cross-cutting metrics.
- `LivePulse` widget shows active-connection count + recent signals (commerce events for v1).
- `SetupChecklist` widget extends from Stripe-only awareness to all five providers (Gmail, GA4, Etsy, LinkedIn, Stripe).
- `ModeTiles` and `SuggestedActions` widgets stay untouched (static navigation is appropriate there).
- "Sample data" indicator drops from the three rewritten widgets once a live snapshot loads.

### Architectural choices

- **Re-use existing snapshots, don't re-fetch from providers.** The dashboard aggregator calls `getFinanceSnapshot`, `getCommunicationsSnapshot`, `getCommerceSnapshot`, `getAnalyticsSnapshot` directly — each has its own 5-minute cache. When the user has recently visited those modes, the dashboard load is sub-200ms (cache hits across the board). Cold load is ~8s (four parallel provider fetches). Cheaper than designing a separate API surface and avoids the consistency-drift problem of two paths reading the same data differently.
- **`Promise.allSettled`, not `Promise.all`.** One provider erroring shouldn't black out the whole dashboard. Each settled-rejected result resolves to `null` and the corresponding headline section renders an empty state. Same null-is-degraded pattern every mode already uses.
- **LinkedIn surfaces as a "social" headline, not a metric.** Member-tier OAuth only gives identity (Session 13's locked scope), so we display `{ connected: true, memberName }` rather than a numeric tile. When the Marketing Developer Platform scopes land in a follow-up, `social` shape gets a `posts` / `reach` field without breaking consumers.
- **`recentSignals` populated from commerce only for v1.** Commerce has the richest cross-cutting event stream already built (`recentActivity` from Session 12). True multi-provider signal mixing (Gmail arrivals + Stripe payouts + GA4 spikes) needs a unified event-timestamp schema and a heuristic for which signals matter; deferred. The field is in the model so the shape is forward-compatible.
- **Setup checklist hooks each connection status independently.** Could have driven the checklist from the `DashboardSnapshot.headline` (any non-null = done), but that conflates "snapshot loaded with data" with "service is connected". A connected-but-empty Stripe (no transactions this month) returns a valid snapshot with `revenue.value = 0` — we still want the checkbox green. So the checklist uses the per-provider `useXConnectionStatus` hooks directly. Cheap because each hook hits the connected_accounts row, not a provider API.
- **Widgets call `markLive()` when they have data.** Without it, the surrounding WidgetShell still renders the "Sample data" indicator — which would be wrong on widgets that are demonstrably showing real cross-cutting state. `markLive` is the same opt-in pattern Session 11+ commerce widgets use.

### New / extended infrastructure

| File | Purpose |
|---|---|
| `lib/integrations/dashboard/model.ts` | `DashboardSnapshot` shape with five nullable headline sections (`emails`, `orders`, `revenue`, `visits`, `social`), `activeConnectionsCount`, and `recentSignals[]`. |
| `lib/integrations/dashboard/snapshot.ts` | `getDashboardSnapshot(companyId)` — `Promise.allSettled` over the four per-mode snapshot loaders + a LinkedIn account-row read, normalized into the headline shape. Includes a `formatCurrency()` helper since the FinanceSnapshot exposes a raw number, not a display string. |
| `lib/integrations/dashboard/read.ts` | `'use server'` — `readDashboardSnapshot(companyId)` with `requireCompanyAccess` guard. |
| `contexts/dashboard-snapshot-context.tsx` | `DashboardSnapshotProvider` + `useDashboardSnapshot()`. Same shape as the four mode-specific contexts. |
| `app/(app)/dashboard/page.tsx` | Wraps the widget grid in `DashboardSnapshotProvider`. |
| `components/widgets/content/dashboard-widgets.tsx` | `IntelligenceBriefing` + `LivePulse` rewired to the snapshot context; `SetupChecklist` extended to recognize all five providers via their existing connection-status hooks; all three call `markLive()` when live data is present. |

### Local verification

- `tsc --noEmit` clean.
- `/dashboard` cold load: ~8.3s (four parallel provider fetches building snapshots from scratch). Second load: ~210ms (full cache hit). Cache TTL is 5 min per provider; refresh-on-mount semantics inherited from the existing per-mode contexts.
- Headline pills against `ce650d4b-…` (DigitalDreamsmiths shop, real data):
    - **201 unread** (Gmail)
    - **4 orders** (Etsy)
    - **$0.00 revenue** (Stripe — connected, zero recent payouts)
    - **0 visits this week** (GA4 — sparse property)
- Setup Checklist: **7 of 7 complete** with all six steps struck-through (workspace + company + five providers).
- Caption switches from the disconnected-prompt to "Live snapshot across your connected platforms" once `activeConnectionsCount > 0`.
- "Sample data" indicator drops from Intelligence Briefing, Live Pulse, and Setup Checklist once a live snapshot loads. Mode Tiles + Suggested Actions retain the indicator (appropriate — they're static).

### Residuals heading into future sessions

- **8-second cold load is the worst dashboard latency in the app.** Acceptable for v1, but the aggregator could parallelize differently or pre-warm in middleware if it starts feeling slow. The 5-minute caches mean only the first per-day visit pays the cost.
- **`recentSignals` is commerce-only.** Multi-provider event mixing is genuinely useful (a "Gmail arrival + Stripe payout + Etsy order" feed) but needs a unified timestamp + relevance heuristic before it stops feeling random.
- **`SuggestedActions` is still static.** Could be driven off the unconnected providers in the checklist (e.g. if Gmail isn't connected, suggest Gmail; if revenue is $0, suggest reviewing Stripe). Deferred — the static copy still reads fine as long as the dashboard remains primarily an integration-status surface.
- **No "today" window across providers.** Each provider has its own time horizon (Etsy = 30d, GA4 = 7d, Stripe = 30d, Gmail = total-unread). The headline pills mix these without labels. Acceptable for v1 because the labels imply windows ("this week" for visits, "unread" for emails, etc.), but a strict same-window cross-cutting view would need each provider to grow a `today` / `last7d` aggregate.
- **LinkedIn "social" headline is currently un-surfaced in any widget.** It's in the snapshot but the existing dashboard widgets don't have a slot for it. A follow-up widget (or rewiring `LivePulse` to include "Connected as {memberName}") would surface it.
- **Generic OAuth-error banner still pending.** Now five providers worth of `?integration/?status/?reason` query params that the mode pages silently ignore.
- **Chip extraction still pending.** Five chips now (Stripe / Gmail / GA4 / Etsy / LinkedIn), all ~95% identical. The duplication has well crossed the abstraction-cost threshold.

---

## Session 15 — Pinterest integration (Marketing mode's first live data tile)

**Goal**: Give Marketing mode an actual live widget. LinkedIn from Session 13 ships identity-only (its API is gated behind multi-week approval); Pinterest's developer platform is friendlier — own-account + own-pin reads work without app review. So Pinterest becomes the provider that flips `MarketingKpiRow` from mock to real data while LinkedIn stays in identity-only mode.

### Locked scope

- Vertical slice: OAuth + connect chip + MarketingSnapshot + one widget live (`MarketingKpiRow`).
- Pinterest is now the data source for the headline tile (Published, Avg Reach, Engagement). LinkedIn continues providing only the connection chip + identity.
- The other four marketing widgets (ContentCalendar, PlatformBreakdown, EngagementTrend, RecentPosts) stay on `MARKETING_MOCK` with badges. Filling them needs daily-granularity metrics + a recent-pins list — additive on the existing snapshot model.

### Architectural choices

- **Pinterest uses PKCE + Basic auth on the token endpoint.** Distinct from both LinkedIn (confidential-only, no PKCE) and Etsy (PKCE + client_secret in body). Pinterest's v5 docs prescribe `code_verifier` in the body alongside an `Authorization: Basic base64(client_id:client_secret)` header — `client_secret` does NOT go in the body. Implemented exactly that way to avoid the LinkedIn-style "invalid_client" trap.
- **Refresh tokens rotate (same as Etsy).** Access tokens last ~30 days, refresh tokens last ~1 year. `loadPinterestCredentials` runs a transparent refresh + persists the rotated refresh token, identical pattern to `loadEtsyCredentials`. Without persistence the user would get logged out after the first refresh window.
- **MarketingSnapshot is provider-shaped, not multi-provider-aggregated.** The shape has a single `provider` field rather than `pinterest` + `linkedin` sub-objects. Reason: only one provider feeds the KPIs at a time. If/when LinkedIn analytics ship, the snapshot grows a `providers[]` array (or splits to a `pinterest:` + `linkedin:` shape). Premature to design for that now.
- **Scheduled-pins is `null`, not zero.** Pinterest's public v5 API doesn't expose scheduled pins (only published). Returning `0` would lie; `null` lets the widget display `—` which is honest. `LinkedIn` and other future providers can populate it when their APIs do.
- **Avg Reach = impressions / published pins.** Pinterest's account-level analytics return aggregate impressions; "per-pin average" is the small-business mental model the mock used. Per-pin rendering needs the per-pin analytics endpoint (one extra request per pin); deferred.
- **Engagement rate = engagement / impressions, formatted as "X.Y%".** Pre-baked so widgets stay dumb (same convention as Etsy currency formatting). `"—"` when impressions are zero — avoids divide-by-zero NaN.
- **One Pinterest account per company (no picker).** Pinterest enforces account boundaries at the OAuth level: a user authenticates as themselves and we read their personal/business account. Multi-account access would require business-manager-grade scopes Pinterest doesn't expose to dev mode.

### New infrastructure files

| File | Purpose |
|---|---|
| `supabase/migrations/20260525000000_add_pinterest_service.sql` | Widens `connected_accounts.service` to include `'pinterest'`. |
| `lib/integrations/pinterest/fetch.ts` | OAuth + v5 API primitives: `PINTEREST_SCOPES`, `generatePkce()`, `buildAuthorizeUrl`, `exchangeCode` (Basic auth header, no client_secret in body), `refreshAccessToken`, `getUserAccount`, `countUserPins` (paginated), `getUserAnalytics` (account-level, 30-day window). |
| `lib/integrations/pinterest/tokens.ts` | `savePinterestCredentials`, `loadPinterestCredentials` (with transparent refresh that persists the rotated refresh_token), `getPinterestAccountRow`, `markPinterest{Disconnected,Error}`, `PINTEREST_SERVICE`. |
| `lib/integrations/pinterest/pkce-cookie.ts` | Same shape as Etsy's — sha256(state)-keyed, path-scoped to `/api/integrations/pinterest`, 10-min TTL. |
| `lib/integrations/pinterest/normalize.ts` | `buildMarketingKpis()` — derives `publishedPosts`, `avgReach`, `engagementRate` from the analytics summary + pin count. |
| `lib/integrations/pinterest/snapshot.ts` | `getMarketingSnapshot(companyId)` — parallel-fetches user account + analytics + pin count, builds + caches as `pinterest:snapshot:{companyId}` for 5 min. `invalidateMarketingSnapshot` for disconnect/callback. |
| `lib/integrations/marketing/model.ts` | `MarketingSnapshot` + `MarketingKpis` shape. V1 only populates the headline tile. |
| `lib/integrations/marketing/read.ts` | `'use server'` — `readMarketingSnapshot(companyId)` with `requireCompanyAccess` guard. |
| `app/api/integrations/pinterest/connect/route.ts` | Signed state + PKCE cookie + redirect to Pinterest consent. |
| `app/api/integrations/pinterest/callback/route.ts` | Verifies state + ownership, recovers PKCE verifier, exchanges code, fetches `/v5/user_account`, saves encrypted tokens + identity, invalidates snapshot, redirects to `/marketing`. |
| `hooks/use-pinterest-connection.ts` | `usePinterestConnectionStatus(companyId)` + `getPinterestConnectUrl(companyId)`. |
| `components/integrations/pinterest-connection-chip.tsx` | Three-state chip + popover. Coral marketing-mode accent (same as LinkedIn). Account row shows `@username`. |
| `contexts/marketing-snapshot-context.tsx` | `MarketingSnapshotProvider` + `useMarketingSnapshot()`. |

### Files modified

| File | Change |
|---|---|
| `lib/types/database.types.ts` | Added `'pinterest'` to the `service` union on both `Row` and `Insert` shapes. |
| `lib/integrations/actions.ts` | Added `getPinterestStatus` + `disconnectPinterest`. |
| `app/(app)/marketing/page.tsx` | Wrapped in `MarketingSnapshotProvider`; renders `PinterestConnectionChip` alongside `LinkedInConnectionChip` in the top-right. |
| `components/widgets/content/marketing-widgets.tsx` | `MarketingKpiRow` now reads from `useMarketingSnapshot()` with mock fallback; calls `markLive()` when snapshot is present so the "Sample data" indicator drops. |

### Pinterest app settings + env prerequisites

User-controlled, required once before the first real connect attempt:

1. **Create an app** at https://developers.pinterest.com → Apps → "Create app". Pick "Production" (vs trial) — production tier works for own-account reads without review.
2. **Authorized Redirect URIs** in the Pinterest app settings: both `http://localhost:3001/api/integrations/pinterest/callback` (dev) and `https://<production-domain>/api/integrations/pinterest/callback` (Vercel).
3. **Env vars**: `PINTEREST_CLIENT_ID=<app id>` + `PINTEREST_CLIENT_SECRET=<app secret>` in `.env.local` and Vercel project settings.
4. **Database migration**: apply `20260525000000_add_pinterest_service.sql` to the Supabase project.

### Local verification

- `tsc --noEmit` clean.
- `/marketing` renders the Pinterest chip in coral next to the LinkedIn-connected chip. Marketing KPI tile still shows mock values (7 / 23 / 2,847 / 4.2%) — expected pending the OAuth round-trip.
- OAuth flow blocked on prereqs at session close (same shape as Etsy + LinkedIn first-connect blockers). Code is verified type-safe and renderable.

### Residuals heading into Session 16+

- **Pinterest "scheduled posts" is permanently null.** Public v5 API doesn't expose scheduled pins. A truthful "—" rather than an inaccurate zero.
- **ContentCalendar / RecentPosts / EngagementTrend / PlatformBreakdown still mock.** Filling them needs the per-pin analytics endpoint + a recent-pins list with metadata. The snapshot shape is forward-compatible — adding `dailyEngagement[]` and `recentPins[]` fields is additive.
- **No per-pin metadata.** A "click into a pin to see its analytics" widget would need the per-pin analytics endpoint and a routable detail view. Deferred.
- **Aggregate avg-reach hides outliers.** A single viral pin can skew the average. A median or percentile reading would be more representative; deferred until widget refresh covers it.
- **No log line on snapshot build (still).** Carried forward from Sessions 10–13.
- **Chip duplication is now SIX chips.** Stripe, Gmail, GA4, Etsy, LinkedIn, Pinterest — all ~95% identical. The extraction case is overwhelming now; it's worth running ahead of any further providers.
- **Cache namespaces total six.** `stripe:` `gmail:` `ga:` `etsy:` `linkedin:` (none actually — LinkedIn has no snapshot cache) `pinterest:`. Redis/Upstash swap residual unchanged in shape but growing in payload.

## Session 19 — Govcon outreach pipeline (Stage 1: USASpending enrichment → synthesis/draft → review queue)

SourceGent is client zero for a govcon cold-outreach intelligence pipeline. Built from the verified spec at `docs/specs/signalgent-outreach-stage1.md`. The generic pattern (ingest → enrich → synthesize → draft → gate → queue) lives in Signalgent; the USASpending research layer is the vertical part. **Send is out of scope** — approved drafts export to a dedicated cold-email platform.

### Locked scope

- **USASpending only** (public API, no key, no rate limit). No SAM.gov for v1.
- Two calls: `spending_by_award` (footprint + `recipient_id`) → `recipient/<id>/` (`business_types` for socioeconomic flags). Award-level `Type of Set Aside` is unreliable (null on Eagle); socioeconomic comes from recipient `business_types`. `total_transaction_amount` can be negative (de-obligations) and is never read.
- Draft register locked in spec (genuine-interest, SourceGent named once as a live tool, soft CTA, no em dashes, site in signature). `facts_for_draft[]` is the only thing the draft may use; `facts_used[]` echoed for drift auto-rejection.

### Architectural choices

- **Ported (not imported) the SourceGent USASpending code** from `docs/specs/sourcegent-reference/` into `lib/integrations/usaspending/`. Self-contained per the spec's "copy now, extract a shared package later" call. `docs/` excluded from `tsconfig` so reference files don't break the build.
- **Resolver = heuristic + AI judge.** Live finding: USASpending fuzzy search needs space-separated tokens, so Haiku segments concatenated domains before querying; a de-spaced, suffix-stripped core comparison scores the result; the Haiku judge adjudicates only weak/ambiguous hits. Match scoring is **prefix/token-aligned only** — a mid-string substring (`ngconstruction` ⊂ `uttingconstruction`) no longer auto-accepts, it falls to the judge. A wrong/low-confidence match routes to the skip pile; never drafts on a wrong entity.
- **Stages 2/3 ride the existing LLM pattern** (`getAnthropicClient` + `pickModel` + `logUsage`). New `LLMTask`s: `resolve` (Haiku), `synthesis` + `draft` (Sonnet). Em dashes deterministically sanitized post-draft.
- **Review queue lives in Marketing mode** (no new mode), company-scoped, RLS mirroring `connected_accounts`.

### New infrastructure files

| File | What |
|---|---|
| `lib/integrations/usaspending/base.ts` | Circuit-breaker fetch (`fetchWithCircuitBreaker`), ported. |
| `lib/integrations/usaspending/contractor.ts` | Call 1: recipient-name → award footprint. Adds `recipient_id` to fields + `mapAwardRow`; rewired to the breaker. |
| `lib/integrations/usaspending/recipient.ts` | Call 2 (net-new): recipient detail → `business_types`, `uei`, location. |
| `lib/integrations/usaspending/resolve.ts` | Domain → company-name resolver (heuristic + Haiku segment/judge), confidence-gated. |
| `lib/integrations/outreach/{types,llm,enrich,synthesize,draft,pipeline,actions}.ts` | Stage 2/3 prompts, the facts contract + drift/dash guards, pipeline glue, and the company-scoped server actions (ingest / run / snapshot / approve / edit / reject). |
| `components/widgets/content/outreach-widgets.tsx` | `OutreachReviewQueue` widget: ingest box, Run enrichment, draft review (approve/edit/reject), skip pile. |
| `supabase/migrations/20260617000000_outreach_pipeline.sql` | `outreach_prospects` + `outreach_drafts` with RLS + touch triggers + indexes. |

### Files modified

| File | Change |
|---|---|
| `lib/llm/models.ts` | Added `resolve` (Haiku), `synthesis` + `draft` (Sonnet) tasks. |
| `lib/types/database.types.ts` | Added `outreach_prospects` + `outreach_drafts` Row/Insert/Update types. |
| `lib/widgets/registry.ts` | Registered `mkt-outreach-queue` (full, marketing); added to marketing default layout. |
| `components/widgets/widget-map.tsx` | Mapped `mkt-outreach-queue` → `OutreachReviewQueue`. |
| `tsconfig.json` | Excluded `docs` (reference `.ts` files are port-reference, not build). |

### Local verification

- Stage 1 calls live-verified against the Eagle Contractors fixture (recipient_id `b353…-C`): top-level `recipient_id` present, null agency/NAICS rows, `business_types` returned, negative `total_transaction_amount` confirmed.
- Full chain run on real targets at the quality gate: Three Wire + Aptive drafted on-register and facts-grounded; Eagle + Interspec correctly skipped (low-bid/thin); freemail + no-prime-award targets skipped. Drift + em-dash guards fire.
- Persisted path verified through the live widget: ingest → run → draft persists → renders in the review queue.
- Resolver precision fix verified: `ngconstructionllc.com` now skips (AI judge: no clear match) instead of resolving to UTTING CONSTRUCTION LLC.
- `tsc --noEmit` + `eslint` clean; `/marketing` compiles with no server errors; widget renders (screenshot).
- Migration applied to the Supabase project.

### Residuals heading into Session 20+

- **Resolver recall.** Some real primes don't segment cleanly from their domain (By Light → no_results). Precision is intact; recall is the open edge. A "needs human disambiguation" bucket (vs. silent skip) would surface near-misses for manual resolution.
- **Sign-off name** set to "Eudon Delemar" in `draft.ts` `SENDER`; change there if outreach is sent under another name.
- **runNewProspects is capped at 15/run** to bound request time; larger lists need repeated runs (or a background job). No streaming progress yet.
- **Marketing layout** is now mixing a monitoring surface (social analytics, mostly mock) with a doing surface (outreach). A dedicated outreach workspace / sub-nav is the proposed next step.
- **No `api_usage` logging** for outreach LLM calls yet (console `logUsage` only); USASpending calls uncached across requests beyond the in-process 7-day map.

## Session 19.1 — Outreach UX: Marketing tabs, two-pane workspace, generic template fallback, dash fix

Follow-up to Session 19 from real-use feedback.

### Changes

- **Dash sanitizer broadened.** `sanitizeDashes` (in `draft.ts`) now also collapses `--` (doubled hyphens) and spaced single hyphens used as dashes, not just em/en dashes; in-word hyphens (`service-disabled`) preserved. Draft prompt hardened to forbid all dash-as-punctuation. Existing drafts in the DB backfilled.
- **Generic template fallback for skipped prospects.** New `lib/integrations/outreach/template.ts` — prospects that can't be personalized (no_results, low_confidence, thin/low-bid synthesis skip, freemail) now get a sendable generic email instead of nothing. NOT fake personalization: zero company-specific claims; body is identical for all, subject optionally addresses a resolved company name. A template is stored as a draft with empty `facts_for_draft` (that emptiness is how the queue distinguishes it from a personalized draft — no schema change).
- **Resolver precision fix.** `matchScore` now credits PREFIX/token alignment only; a mid-string substring (`ngconstruction` inside `uttingconstruction`) no longer auto-accepts and falls to the AI judge → skip. Fixes a real false positive seen in live data.
- **Marketing → Overview / Outreach tabs.** `app/(app)/marketing/page.tsx` now has a tab control. Overview = the existing widget grid (unchanged). Outreach = a dedicated two-pane list+detail workspace (`OutreachWorkspace`): filterable prospect list (To review / Templates / Approved / All) + ingest + Run enrichment on the left; selected draft with enrichment context, facts traceability, personalized/template + drift badges, and Approve/Edit/Reject on the right.
- **Outreach removed from the widget grid** (registry/widget-map/default-layout). `getLayout` now drops placed widgets whose type is no longer in the registry, so a stale saved layout never renders a "Widget not found" tile.

### Local verification

- `tsc --noEmit` + `eslint` clean.
- Live in preview: Overview/Outreach tabs render; Outreach workspace shows filters + list/detail; ingesting a no-match email produces a `TEMPLATE` draft with the "couldn't personalize: no_results" reason and the generic body signed Eudon Delemar / sourcegent.io; resolver fix verified (`ngconstructionllc.com` → skip, no UTTING).

### Residuals

- **Old pre-19.1 skips have no draft rows** (templates only attach on runs after this change). A re-run backfill (reset to `new`, run) would populate them and re-resolve under the fixed scoring; deferred by choice.
- Carryover from Session 19: resolver recall edge, `runNewProspects` 15/run cap, no outreach `api_usage` logging.

## Session 19.2 — Outreach: bulk approve + CSV export

Follow-up to 19.1 from real-use feedback (especially valuable now that template fallbacks generate many low-touch drafts).

### Changes

- **Bulk approve.** New `approveDrafts(companyId, draftIds[])` server action; an `Approve all (N)` button on the To-review and Templates filters approves every pending draft currently in view in one call.
- **Export.** `Export CSV (N)` exports the current filter's rows (filter to Approved, then export) as one row per company — columns `email, company, domain, status, kind, subject, body, location, business_types, award_count, sampled_total, resolution_confidence, synthesis_confidence`. Client-side Blob download, opens in Excel and imports into cold-email platforms. Per-draft `Copy` button (subject + body) for one-off use. Bodies are final per-recipient copy, so the intended flow is approve-all → filter Approved → Export CSV → import to the sending platform.

### Cost (measured, for reference)

USASpending is free. Claude calls only, from logged token counts × current pricing (Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15): resolve ~$0.0003 (Haiku), synthesis ~$0.011, draft ~$0.0095 (Sonnet). Per prospect: personalized draft ~2¢, synthesis-skip ~0.5¢, no-match/freemail <0.1¢. Blended ~$0.70–$2.00 per 100 prospects depending on draft rate. Prompt caching is off but the system prompts are small, so caching would save ~$0.002/100 — not worth wiring up yet.

### Local verification

- `tsc --noEmit` + `eslint` clean.
- Live: Approve all bulk-approved a pending template (Templates → Approved, "Approved 1 draft"); Export CSV button renders per filter with the row count; Copy added to the detail pane.
