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

## Session 19.3 — Outreach: progress panel, Exported lifecycle, api_usage logging, needs-review bucket

Closes the Session 19 residuals plus two requested features.

### Changes

- **Progress panel + auto-batching.** `runNewProspects(companyId, limit)` now takes a chunk size (hard-capped at 15/call). The widget's Run enrichment drives a chunked loop (5 at a time) until the queue drains, rendering a live progress bar ("Enriching X of Y · N personalized · M template") and refreshing the list after each chunk. This both shows progress and lets lists larger than the per-call cap finish in one click (resolves the 15/run residual).
- **Exported lifecycle.** New `exported` draft status (migration `20260618000000_outreach_draft_exported.sql`). `markExported(companyId, draftIds[])` action; "Mark all exported (N)" on the Approved filter and a per-draft "Mark exported" button in the detail pane both move downloaded/sent drafts to a new **Exported** filter so Approved stays lean. **Requires the migration to be applied.**
- **api_usage logging.** Threaded an optional `LLMUsage[]` collector through resolve/synthesize/draft → pipeline → `runNewProspects`/`resolveManual`, which writes one `api_usage` row per call (service `anthropic`, model, tokens, `cost_usd`, feature `outreach:<task>`). Cost from a per-model price table (Haiku $1/$5, Sonnet $3/$15). Verified live: a no-match run logged `outreach:resolve` Haiku 121/32 tokens = $0.000281.
- **Needs-review bucket + manual disambiguation.** Low-confidence resolver skips (`skip_reason` starts with `low_confidence`) are now flagged `needs_review` and surfaced in a **Needs review** filter instead of silently skipping. The detail pane shows a "type the correct company name" input → `resolveManual(companyId, prospectId, name)` → `resolveByName` (explicit-name USASpending lookup, user-asserted, no AI gate) → re-runs synth/draft and persists. Recovers prospects the domain resolver missed or matched wrong.
- **.xlsx export — intentionally not built.** The existing CSV opens in Excel and imports into every cold-email platform; native `.xlsx` would mean adding a SheetJS dependency for marginal benefit. Deferred unless a true `.xlsx` is specifically needed.

### Files

New: `supabase/migrations/20260618000000_outreach_draft_exported.sql`. Modified: `resolve.ts` (+`resolveByName`, usage collector), `enrich.ts` (+`enrichByName`, shared `enrichFromResolved`), `pipeline.ts` (+`runPipelineFromName`, shared tail), `synthesize.ts`/`draft.ts`/`llm.ts` (collector param), `actions.ts` (`persistOutcome`/`recordUsage` helpers, chunked `runNewProspects`, `markExported`, `resolveManual`, exported+needs_review counts), `outreach-widgets.tsx` (progress panel, Exported + Needs review filters, Mark-exported, manual-resolve UI), `types.ts` + `database.types.ts`.

### Local verification

- `tsc --noEmit` + `eslint` clean.
- Live: six filter tabs render; progress bar shows during a chunked run; `api_usage` row written with cost; "Mark all exported (N)" renders on Approved. Exported write path pending the migration apply.

### Residual

- Exported features need `20260618000000_outreach_draft_exported.sql` applied to Supabase.
- Manual resolve takes the top USASpending match for the typed name; a multi-candidate picker would be a further refinement.

## Session 23 — Outreach send-pipeline hardening: crash recovery, write verification, cron isolation, health banners

**Goal**: Eliminate the silent-failure modes in the live send pipeline: rows stranded in `sending` forever after a cron crash, unchecked Supabase writes that could double-email a real prospect, one bad company killing the whole cron tick, and pipeline-stopping states (auto-pause, Gmail token failure) that nothing surfaced to the user.

### Locked scope

- IN: stale-`sending` recovery, error-checked send-status writes with retry, per-company cron try/catch, UI banners for paused sending + Gmail connection errors.
- NOT in: automatic re-queue of interrupted sends (deliberately — see below), Gmail Sent-folder verification of interrupted sends, alerting/email notifications, provider-level idempotency keys.

### Architectural choices

- **Interrupted sends are marked `failed`, never blindly re-queued.** A row stuck in `sending` means the tick died somewhere around `provider.send()` — the email may already be in the recipient's inbox. Re-queuing risks a duplicate cold email to a real prospect (reputation damage); failing with error `interrupted mid-send, verify in Gmail Sent folder before re-queuing` keeps the human in the loop. The failed send surfaces in the draft detail pane with its error, and the "Queue to send" button remains available after manual verification.
- **Staleness keys on `updated_at`, set explicitly in code — no schema change.** `outreach_sends` has an `updated_at` column but (unlike `outreach_prospects`/`outreach_drafts`) no touch trigger, so the worker now writes `updated_at` on every status transition it owns. Rows stranded before this fix still recover: their `updated_at` is the insert-time default, already older than the 10-minute threshold (`STALE_SENDING_MINUTES`). The sweep (`recoverStaleSending`) runs at the top of `runQueue` *before* the `active` check, so a manual "Process queue" recovers stuck rows even while sending is paused. No migration needed.
- **When the `sent` mark fails, retry the UPDATE — never the send.** `updateWithRetry` (3 attempts, 500ms/1s backoff) wraps the two lifecycle-critical writes: `sent` (a dropped write here makes a delivered email look retriable → duplicate) and `failed`. If the `sent` mark still fails after retries, the row stays `sending` and the stale sweep later flips it to `failed` with the verify-first note — conservative in the same direction as crash recovery. The claim write (`queued`→`sending`) is checked too: if it can't be recorded, the row is skipped this tick rather than sent with untracked state.
- **Cron isolates companies.** Each company's `enforceBouncePause` → `enrichToBuffer` → `runQueue` → `scanReplies` chain is wrapped in try/catch; a throw is logged, pushed to an `errors: [{company_id, error}]` array in the response JSON, and the loop continues. Previously one throw 500'd the whole tick and starved every other company.
- **Health surfaced where the user already looks.** `getOutreachSnapshot` now reports `sending.provider` and (when provider is `gmail`) `sending.gmail: {status, last_error}` from `connected_accounts` — the row `lib/integrations/google/tokens.ts` flips to `error` when token refresh fails. The Outreach workspace renders prominent banners for: Gmail not `connected` (red, with `last_error`, points to Settings → Connections), bounce-rate auto-pause (existing banner, restyled), and manual pause while sends are still queued (the "I paused and forgot, why is nothing going out" case).

### Files modified

| File | Change |
| --- | --- |
| `lib/integrations/outreach/send/worker.ts` | `STALE_SENDING_MINUTES`, `recoverStaleSending()`, `updateWithRetry()`; runQueue sweeps stale rows first and returns `{sent, failed, recovered}`; all four status writes (cancel/claim/sent/failed) error-checked; claim sets `updated_at` explicitly |
| `app/api/outreach/cron/route.ts` | Per-company try/catch; response JSON gains `recovered` and `errors[]` |
| `lib/integrations/outreach/sending.ts` | `processSendQueue` result type includes `recovered` |
| `lib/integrations/outreach/types.ts` | `OutreachSnapshot['sending']` gains `provider` + `gmail` health |
| `lib/integrations/outreach/actions.ts` | Snapshot fetches the gmail `connected_accounts` row when provider is `gmail` |
| `components/widgets/content/outreach-widgets.tsx` | `Banner` component; Gmail-error / auto-pause / manual-pause-with-queue banners; process-queue notice reports recovered rows |

### Local verification

- `npx tsc --noEmit` clean. `eslint` on touched files: only pre-existing issues (the `set-state-in-effect` error at the `loadScheduled` effect and the unused `Database` import warning predate this session).
- No migration to apply — the fix rides on the existing `outreach_sends.updated_at` column.

### Residuals heading into Session 24

- **Recovered-send verification is manual.** A follow-up could check Gmail's Sent folder (via the existing `getThread`/search plumbing) to auto-classify an interrupted send as actually-sent vs. safe-to-requeue.
- **`connected_accounts` writes from the cron path** (`markError` in the shared Google token loader) go through the injected service-role client, but the snapshot read uses the RLS client — fine for the v1 single-workspace user, worth revisiting for multi-tenant.
- Session numbering: 20–22 (outreach pivot, reply/bounce detection, warmup waves) shipped without changelog entries; this entry assumes they occupy those numbers.

## Session 24 — Outreach workspace UX bundle: auto-refresh, toasts, top health banners, mobile layout, send retry

Small daily-use fixes from real use (desktop + phone). Landed alongside Session 23 (send-pipeline hardening) — the two touched the same widget file; the merge resolution below folds Session 23's health banners and recovered-send reporting into this session's toast/top-banner model.

### Changes

All in `components/widgets/content/outreach-widgets.tsx` unless noted.

- **Auto-refresh.** The snapshot used to load once on mount and go stale while the Vercel cron mutated send/reply state every 5 minutes. A polling effect now refetches every 2.5 minutes while the tab is visible (`document.visibilityState` guard, no fetches from a backgrounded tab) and refetches immediately on `visibilitychange` back to visible — so returning to the tab shows current counts at once. The Scheduled tab's list refreshes on the same tick when active.
- **Toast stack replaces the ephemeral `notice`.** Action results (ingest, enrich, approve, process queue, scan replies, schedule, delete) now push toasts to a fixed bottom-right stack instead of a single line that the next action silently overwrote. Info toasts auto-dismiss after 4s; error toasts get a red border and persist until dismissed (×). "Process queue" with partial failures — or Session 23's recovered-from-interrupted rows, which need a manual Gmail Sent check — reports as a persistent error toast so it isn't missed.
- **Health banners moved to the top.** Session 23's three pipeline-stopping banners (Gmail connection broken, bounce-rate auto-pause, manual pause with emails still queued) rendered below the metrics grid where they scrolled out of sight; they're now the first elements in the workspace (same shared `Banner` component, ⚠ prefix) so a stopped pipeline is impossible to miss.
- **Mobile layout.** The two-pane review grid hard-coded `minmax(0, 300px) minmax(0, 1fr)`, which broke at phone widths. A small `<style>` block (inline styles can't express media queries) makes it stack to one column below 700px, capping the list pane at 38vh so the detail pane stays reachable; the same query gives buttons and text inputs a 40px min-height for touch. Found live: the app shell's fixed-height flex chain squeezed the stacked panes to ~2px on a phone (the wrapped header/metrics/tabs ate the whole viewport), so the mobile query also releases the workspace height (`height: auto !important` to beat the inline style, plus `flex-shrink: 0` so the page wrapper can't squeeze it back) and lets the already-scrollable `<main>` handle vertical scroll. `app/layout.tsx` now also exports a `viewport` object (`width: device-width, initialScale: 1`) — Next 16 emits a default viewport meta tag, but the export makes the mobile intent explicit (per `node_modules/next/dist/docs/.../generate-viewport.md`, the `viewport` export replaced viewport-in-`metadata`).
- **Retry failed sends.** A failed send row showed the error with no recovery path short of re-approving. A one-click Retry button next to the failure message calls the existing `queueDraftSend` (its duplicate guard only blocks `queued/sending/sent`, so re-queueing after `failed` was already allowed server-side — no backend change).

### Local verification

- `tsc --noEmit` clean.
- Live in preview against real data (1,000 prospects): toast appears bottom-right within ~300ms of an action and auto-dismisses at ~4s (measured by polling); at 375px the grid stacks to one column (list 308px = 38vh with internal scroll, detail at natural height, no horizontal overflow), buttons/inputs hit 40px; back at desktop the two panes (300px + 1fr), fixed-height workspace, and 30px buttons are unchanged. Viewport meta serves `width=device-width, initial-scale=1`.
- Not exercised live: error-toast persistence (same code path as info minus the timeout) and the 2.5-min poll tick (code-reviewed only).

### Residuals

- Polling refetches the full snapshot (~same payload as initial load) every 2.5 min; fine at current list sizes, revisit if prospect counts grow into the thousands (delta endpoint or SWR).
- Retry on a Session-23-recovered send ("interrupted mid-send") is one click away from double-emailing if the user skips the Gmail Sent check the error text asks for; a confirm step on that specific error string would be safer.

## Session 25 — Outreach: send-window time parsing (queue-to-send landed ~500 days out)

Bug from real use: every "Queue to send" scheduled the email for late 2027. Root cause found in prod data: the sending-settings window was stored as `09:00 am` / `8:00 pm` (typed free-text into the modal), and the scheduler's `parseHM` only understood 24h `HH:MM` — it read `8:00 pm` as 8:00 **AM**, inverting the window (start 09:00, end 08:00). `nextSlot`'s day-scan then never found an admissible day and ran off its 500-iteration guard, returning a slot ~500 days out. (Batch scheduling was unaffected — `computeBatchSlots` doesn't consult the window — which is why "queue all" dates looked sane while single queues didn't.)

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/send/worker.ts` | `parseHM` replaced by exported `parseWallTime`: accepts `17:00`, `9:00`, `8:00 pm`, `8pm`, `5:05p`, `5 P.M.`; returns `null` on garbage instead of guessing. `nextSlot` falls back to 09:00/17:00 per side when unparseable, and to the full default window when the parsed window is inverted/empty — so bad settings can never again send the scan off its guard. |
| `lib/integrations/outreach/sending.ts` | `saveSendSettings` normalizes both window fields to canonical 24h `HH:MM` via `parseWallTime`, rejects unparseable values with a clear error, and rejects `end <= start`. |
| `components/widgets/content/sending-settings-modal.tsx` | Hint line under the window inputs: 24-hour HH:MM, or add am/pm. |

### Out-of-band data fix (prod, applied this session)

- `outreach_settings.send_window_start/end` normalized `09:00 am`/`8:00 pm` → `09:00`/`20:00`. This alone fixes the deployed scheduler immediately (the old parser reads 24h correctly); the code change prevents recurrence if am/pm times are typed again.
- The three sends stranded on 2027-12-06 had already been rescheduled in-app to 2026-07-29 before the repair script ran; queue verified healthy afterward (67 queued: 45 on 07-27 at the warmup cap, 19 on 07-28, 3 on 07-29).

### Local verification

- `npx tsc --noEmit` clean.
- `parseWallTime` exercised via node against 16 cases (24h, am/pm variants, `12 am`/`12:30 pm` edges, junk like `13:00 pm`, `8:75`, `banana` → null).

### Residuals

- `computeBatchSlots` still ignores the send window and weekends by design (explicit user-chosen start time); if that ever surprises, clamp there too.
- The enrich wave depth is hardcoded (`WAVE_DAYS = 3` in `enrich-run.ts`); making it a setting needs a migration.

### Addendum (same session) — "Needs review" never cleared once handled

Found live right after the window fix: 11 of 13 low-confidence prospects had approved (and queued) drafts yet still sat in the Needs review tab. The flag only cleared via the manual "Resolve" re-match box — approving/queuing the template draft was invisible to it.

- `lib/integrations/outreach/actions.ts` — `needs_review` now also requires the prospect be `open` **and** every draft still `pending`: acting on a draft (approve/edit/send) or closing the prospect counts as the decision and drops it from Needs review.
- `components/widgets/content/outreach-widgets.tsx` — the detail-pane "Uncertain match → Resolve" box now keys off the raw skip fields instead of `needs_review`, so a shaky match stays fixable even after its draft was approved or sent.
- Verified `tsc --noEmit` clean; predicate confirmed against prod data (the 11 approved-draft prospects drop out, the 2 still-pending ones remain).

## Session 26 — Outreach: snapshot hid 3,900 prospects (and every personalized draft) past PostgREST's silent 1,000-row cap

Found while auditing "is the USAspending check silently failing?" (it isn't — 409 prospects processed, outcomes all recorded, only 2 `api_error`; ~4% of `no_results` skips are AI-segmentation flakiness, the rest are genuine SAM-registrants-without-awards). The real bug was visibility: `getOutreachSnapshot` selects with no limit, Supabase truncates every select at 1,000 rows **without an error**, and the 4,933-prospect list was ingested in one batch so all rows share one `created_at` — the UI showed an arbitrary 1,000 prospects and hid the rest, including all 10 personalized drafts (the only prospects that fully passed the USAspending check), which sat unreviewable in `pending` while 244 generic templates went out.

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/fetch-all.ts` (new) | `fetchAllPages` — pages a PostgREST query in 1,000-row ranges via a query-factory callback (builders are single-use). Callers must order deterministically with a unique tiebreaker; page errors degrade to partial results with a console.error, matching the callers' prior unchecked-select behavior. |
| `lib/integrations/outreach/actions.ts` | `getOutreachSnapshot` pages all four reads (prospects, drafts, api_usage cost rows, sends), each with `.order(...).order('id')` so the mass-ingest `created_at` ties can't skip/duplicate across page boundaries. |
| `lib/integrations/outreach/enrich-run.ts` | `backfillTemplateDrafts` pages its skipped-prospects and drafts reads — a capped drafts read would misread existing drafts as missing (duplicate upserts, harmless but wasteful); a capped skipped read would strand the tail. |
| `lib/integrations/outreach/send/worker.ts` | `nextSlot` / `computeBatchSlots` page their `outreach_sends` reads and bound them to `scheduled_at >= now − 48h` (older rows can't affect slot search). Unfixed, the sends table crossing 1,000 rows (~6 weeks at current pace) would silently under-count scheduled days and overshoot the daily cap. |

### Verification

- `npx tsc --noEmit` clean.
- Paging pattern replayed against prod via PostgREST: 4,933 rows, 4,933 unique ids (no boundary dupes despite ~4,900 identical `created_at`), all 10 drafted prospects present.
- Live in preview: To review tab lists all 10 personalized drafts with facts/confidence panes; header counts read PROSPECTS 4933 / TO REVIEW 10; no console errors.

### Residuals

- The snapshot now ships ~4,900 prospect views to the client (~5 paged queries, one per 1,000 rows); fine today, but the Session 24 residual (delta endpoint / server-side filtering) is now more relevant.
- AI-segmentation failures inside the resolver are recorded as `no_results`, indistinguishable from genuine no-award domains (console.warn only). Distinct `ai_error` skip reason + a periodic re-run of `no_results` skips would recover the ~4% false-skip tail (measured on a 48-email sample; e.g. `tcsservices.net` → TCS SERVICES LLC resolves 5/5 locally but was skipped in prod).
- Freemail prospects (gmail etc.) can never be USAspending-verified yet still receive template sends by design; revisit whether they belong in the send queue at all.

### Addendum (Session 26) — draft prompt: ban spam-trigger words; queued drafts scrubbed

Real-use check of the 10 personalized drafts: 8 contained "congratulations" (the prompt's "good wishes either way" rule practically invited it — every instance was the closing line), which `hygiene.ts` flags as spam bait. Zero em/en dashes (the Session-spec `sanitizeDashes` pass is doing its job) and no other spam patterns.

- `lib/integrations/outreach/draft.ts` — the close-warm rule now explicitly bans the hygiene list's high-risk words (congratulations, guarantee, winner, act now, limited time, risk-free, 100%, cheap) and steers to "well done on X" / "good luck with X".
- Out-of-band data fix (prod): the 8 affected drafts AND their 10 queued `outreach_sends` copies (scheduled Aug 5–7, none sent) had the congratulations sentence rewritten in place; re-scan verified 10/10 drafts and 10/10 queued sends clean. The lone remaining "dash" hit in send bodies is the RFC signature delimiter (`--`) before the CAN-SPAM footer — intentional, not prose.
- Also confirmed from prod data: the 4,933 prospects arrived as ONE paste on 2026-06-29 (4,930 rows + 3 test rows); "I had 1,000 contacts" was the snapshot cap from the main Session 26 bug, not a real count. All 4,933 emails unique; ingest dedup (in-paste set + `company_id,email` upsert-ignore) working as designed.

## Session 27 — Outreach: template emails sent with a broken greeting, literal `{your team}`, and no signature

Reported from a real received email: every template send opened "Hi your team," and ended with only the mailing address, no sender name. Four defects behind it, three in code and one the model's.

### Root causes

1. **Broken salutation.** `renderTemplate` substituted `{company}` with the inline fallback `your team` everywhere, including the salutation, so every template email to an unresolved prospect opened "Hi your team,". Template drafts go *only* to prospects that failed USASpending resolution, so `recipient_name` is almost always null, making this the norm rather than an edge case.
2. **Literal braces in sent mail.** The user's templates use Handlebars-style `{{company}}`, but the replace only matched single braces. `/\{company\}/` matches the INNER braces of `{{company}}`, so the substitution left a visible `{your team}` in the body. 51 already-sent emails carried it.
3. **Signature never appended.** `composeEmail` read `physical_address` and `unsubscribe_line` but never `settings.signature` — the setting was dead config. Personalized drafts carry the model's own sign-off so nobody noticed; user templates have none, so they arrived signed by nothing but a street address. 93 sent emails.
4. **`[Name]` placeholder in personalized drafts.** Two drafts opened "Hi [Name],". The prompt never specified a greeting, and the model has no contact name to use (only an email address). None had been sent.

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/template.ts` | `renderTemplate` accepts `{{company}}` and `{company}` (double replaced first, or the single pass eats the inner braces). With no resolved name the salutation placeholder is dropped entirely ("Hi,") instead of falling back inline. New exported `prettyCompany` un-shouts USASpending's legal names for body copy ("OLGOONIK SOLUTIONS LLC" → "Olgoonik Solutions"), preserving vowel-less acronyms (KBTS, TCS, SVCS) and leaving mixed-case names alone. |
| `lib/integrations/outreach/send/compose.ts` | Appends a sign-off before the compliance footer when the body has none: `settings.signature`, else `Best,\n<sender_name>\n<site>`. Guarded by `hasSignature` so personalized drafts don't get a second one. |
| `lib/integrations/outreach/draft.ts` | Prompt mandates a bare "Hi," greeting and bans square brackets. New exported `stripPlaceholders` (applied in `reviewDraft` alongside `sanitizeDashes`) collapses "Hi [Name]," → "Hi," and strips any other bracketed token — same fix-don't-flag posture as the dash rule, since the model leaks these despite the prompt. |

### Out-of-band data repair (prod, applied this session)

- Re-rendered **111 unsent user-template drafts and their 111 queued sends** through the fixed pipeline (greeting, braces, signature). Built-in-template drafts already had "Hi," and a sign-off and were left alone.
- Stripped `[Name]` from 2 personalized drafts + their 2 queued sends.
- Prepended "Hi," to 3 personalized drafts that opened with no salutation at all.
- Post-repair audit of all 164 queued: 0 placeholders, 0 braces, 0 "Hi your team", 0 missing signature, 0 spam-flag words, 0 prose dashes, 0 missing greeting.

### Not repairable

245 emails already sent: 93 went out with "Hi your team," and no signature, 51 of those with a visible `{your team}`. Nothing sent contained a `[Name]` placeholder.

### Residuals

- `stripPlaceholders` on a MID-SENTENCE placeholder leaves a grammatical hole ("Reach out to about the work"). Both observed cases were salutations; a mid-sentence leak would need a redraft, not a patch.
- `prettyCompany` title-cases by a vowel heuristic; a vowel-bearing acronym (e.g. "NASA Solutions") would become "Nasa Solutions".
- The templates still say "free analysis"; `hygiene.ts` deliberately omits the "free" family to avoid false positives, so it is unflagged. Worth a judgment call on whether that phrasing is costing deliverability.

---

## Session 28 — Outreach: 344 sends, 0 replies. Register rewrite, five new templates, open tracking, List-Unsubscribe

344 emails sent, 0 replies, 11 bounced/opt-out. Two separate problems: copy nobody could answer, and no instrumentation to tell that apart from copy nobody ever saw.

### Root causes (copy)

1. **No question anywhere.** The locked Stage 3 register closed on a good wish ("Either way, wishing you a strong run on your upcoming bids"). That is a permission slip to ignore the email. The CTA before it ("if easing the proposal load is on your mind, I am happy to share how other firms are using it") asked the reader to self-diagnose, then opt into something vague. Nothing in the email was answerable.
2. **All five user templates made the SAME ask.** Every one ended "reply with the solicitation number and I'll run a free analysis." The rotation varied only the opening paragraph, so 163 template sends were one email wearing five hats — the variable that determines a reply was held constant. All five also opened `Hi {company},`, greeting the company by its legal name, and all five said "free".
3. **Abstract benefit language.** "A lighter proposal load", "the busywork drops", "heavy lifting". Nothing to picture.
4. **Subject line unconstrained.** The prompt never specified one, so 344 personalized emails went out with inconsistent, unattributable subjects, most of them benefit claims that read as marketing ("A lighter proposal load for Acme").
5. **Length.** Bodies ran 90–150+ words against a three-paragraph problem→solution→CTA skeleton the register had explicitly banned.

### Root causes (instrumentation)

6. **No open tracking at all.** Nothing wrote an `opened_at`; there was no pixel. "0 replies" was undiagnosable — a spam-placement failure and a copy failure look identical and have opposite fixes.
7. **`List-Unsubscribe` header absent.** `composeEmail` put an unsubscribe *line* in the CAN-SPAM footer, but never the RFC 2369/8058 headers, which are what Gmail and Outlook actually read. A footer without the header reads more like bulk mail, not less.

### Changes — copy

| File | Change |
| --- | --- |
| `lib/integrations/outreach/draft.ts` | Register rewritten. Body must END on one closed question with nothing after it; 90-word ceiling (60 for nudges); must name a concrete artifact (compliance matrix, shred, Section L) with vague benefit language banned by name; subject constrained (2–5 words, lowercase, topic-or-question, never a benefit claim, never the company name). New `stripReleaseValves` deletes closing pleasantries unconditionally (same fix-don't-flag posture as `sanitizeDashes`), plus `bodyWordCount` / `endsOnQuestion`. Shape failures deletion can't fix trigger exactly one re-ask with the specific complaint. Follow-ups reuse the prior subject so they thread. |
| `lib/integrations/outreach/sender.ts` (NEW) | `SENDER` moved out of draft.ts so client components can read it without pulling the Anthropic SDK into the browser bundle. Adds `userCount` / `pipeline` social proof (~20 contractors, >$4M in active pursuits) in one place, so a stale number can't survive in one variant. |
| `lib/integrations/outreach/template-library.ts` (NEW) | Five built-in variants, each asking a DIFFERENT question — process, capacity, past performance, recompete timing, routing — so the rotation tests which *ask* lands. Each pairs with its own follow-up. Openers 73–88 words, follow-ups 19–50. Client-safe. |
| `lib/integrations/outreach/template.ts` | Now the rendering half only. `renderTemplate` drops a preposition-governed placeholder whole rather than substituting ("handled in house at {company}" → "handled in house", not "at your team"). Built-ins rotate deterministically by prospect id (FNV-1a), so an opener and its follow-up land on the same variant with no schema column. |
| `lib/integrations/outreach/hygiene.ts` | New `replyRiskWarnings`: no closing question, release-valve phrases, >90 words, vague language, nothing concrete (skipped under 55 words — a nudge shouldn't restate the pitch), long subject, company name in subject, missing `{company}`. Dependency-free so client components can import it. |
| `components/widgets/content/templates-modal.tsx` | Five one-click starters + a live reply-risk panel as you type. Advisory, never blocking. |
| `components/widgets/content/outreach-widgets.tsx` | Reply-risk pill and line on every draft in the review queue, alongside the existing deliverability warnings. |
| `docs/specs/signalgent-outreach-stage1.md` | The "final, tested" Stage 3 register marked superseded, with a table of what each original rule cost and what replaced it. draft.ts is now the source of truth. |
| `docs/outreach-template-refresh.sql` (NEW) | Portable SQL (Supabase editor or psql) to deactivate the old five and insert the new five for one company. Takes a `REPLACE_WITH_COMPANY_ID` placeholder rather than a baked-in uuid, so no tenant id lives in the repo. Deactivates rather than deletes, so historical per-template stats survive. Generated from `TEMPLATE_LIBRARY`. |

### Changes — instrumentation

| File | Change |
| --- | --- |
| `supabase/migrations/20260806000000_outreach_open_tracking.sql` (NEW) | `open_token`, `unsub_token`, `opened_at`, `last_opened_at`, `open_count`, `unsubscribed_at` on `outreach_sends`. Two independent tokens: the open token travels in a pixel URL every scanner fetches, so the unsubscribe token must not be derivable from it. All nullable — the ~400 existing rows predate tracking. |
| `lib/integrations/outreach/send/tracking.ts` (NEW) | URL construction off `NEXT_PUBLIC_APP_URL` (null disables tracking rather than emitting a broken URL), `textToHtml` (escaped, linkified, styleless, pixel last), and `listUnsubscribeHeaders`. One-click is only advertised when there is an HTTPS POST target. |
| `lib/integrations/gmail/mime.ts` | `buildMessageMime` gains `htmlBody` → multipart/alternative (plaintext first, as the spec requires) and the `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Also fixes a latent bug: parts declared `7bit` while carrying UTF-8. Non-ASCII parts are now base64-encoded; pure-ASCII parts are byte-identical to before. |
| `app/api/outreach/open/[token]/route.ts` (NEW) | 1×1 GIF, `no-store`. Returns the same pixel whether or not the token matched, so it leaks nothing. Recording is best-effort and never breaks the image. |
| `app/api/outreach/unsubscribe/[token]/route.ts` (NEW) | **GET does not mutate** — it renders a confirmation page with a POST button. Corporate link scanners crawl every URL in an inbound email, so a mutating GET would suppress prospects who never clicked. POST is the mutation and doubles as the RFC 8058 one-click target, returning a bare 200 to one-click clients. |
| `lib/integrations/outreach/send/track-store.ts` (NEW) | Service-role token lookups. Opens within 15s of send are ignored (scanner/MPP prefetch, which would otherwise report ~100% opens). Unsubscribe also cancels the prospect's queued sends. Idempotent. |
| `lib/integrations/outreach/send/compose.ts` | Footer carries a real unsubscribe URL matching the header, with the configured `unsubscribe_line` as its lead-in. |
| `lib/integrations/outreach/sending.ts`, `send/worker.ts` | Tokens minted at queue time (the body embeds the unsubscribe link before the row exists). Both paths degrade if the migration hasn't been applied yet: the insert retries without tokens, and the worker falls back to the pre-tracking column set rather than selecting a missing column, returning zero rows, and silently halting ALL sending. |
| `lib/integrations/outreach/send/scan.ts` | `openStats` — open rate over TRACKABLE sends only. Pre-tracking sends are excluded from the denominator; counting them would report a near-zero rate forever. |
| `components/widgets/content/outreach-widgets.tsx` | OPEN RATE metric with a `n of m tracked` hint. |

### Verification

- Every variant rendered with and without a resolved company name, checked for stray braces, awkward fallbacks, dash punctuation, closing question, word ceiling, and self-consistency against `replyRiskWarnings`. Rotation spread across all five over 40 ids; opener/follow-up pairing confirmed stable.
- MIME asserted structurally: multipart ordering, boundary integrity, CRLF, header format, pixel presence, HTML escaping, and that the plaintext-only path is unchanged.
- Endpoints exercised live: pixel returns a valid 42-byte GIF with `no-store`; unsubscribe GET renders the confirmation without mutating; one-click POST returns a bare 200.
- Templates modal verified in-browser: five starters load, live lint fires on the old copy (4 warnings) and is silent on a starter.

### Existing-copy repair — `scripts/requeue-unsent-copy.ts` (NEW, `npm run requeue`)

Swapping `outreach_templates` only changes what FUTURE fallback drafts render from. Every draft that already existed still carried the old copy. Measured on prod: **149 unsent drafts**, all template-derived (61 queued, 88 approved-or-pending but not yet queued) — so fixing only the queue would have left 88 landmines to go out later with the old ask.

The script re-renders template drafts from the active rotation and re-drafts personalized ones through Stage 3 using the synthesis already stored on the draft (no re-enrichment, no USASpending calls). Where a draft also has a QUEUED send, that row is updated in place with new subject/body plus tracking tokens, preserving `scheduled_at` so the drip calendar and daily caps are untouched. Dry run by default; refuses to write while sending is active; every write guarded on `status='queued'`; a failed redraft leaves that prospect untouched rather than dropping it.

Also corrected `outreach_sends` Update type — `subject`/`body` were absent because nothing had ever updated a composed send in place.

### Bug found in live verification: opens recorded on unsent rows

`recordOpen` only skipped opens within 15s of `sent_at`; when `sent_at` was null (queued, not yet sent) the guard fell through and the open was recorded. Invisible at the time, because `openStats` filters to `status='sent'` — then a permanent false positive the moment the row shipped. Caught by hitting a real queued row's pixel during end-to-end verification, which produced an `opened_at` **243 seconds before** its `sent_at`.

Fixed by rejecting outright when `sent_at` is null, which also gives the invariant `opened_at >= sent_at`. One polluted prod row was reset; the audit predicate (`opened_at < sent_at OR sent_at IS NULL`) generalizes if it ever needs re-running.

### Sent-volume correction

Of the 343 emails sent, **333 were template-derived and only 10 personalized**. The template rotation was doing essentially all the work, which makes the template swap the high-leverage change and the Stage 3 register rewrite the smaller one.

### Handoff (not applied)

1. Apply `supabase/migrations/20260806000000_outreach_open_tracking.sql` (remote-only, out-of-band). Until then tracking is inert and sending continues unchanged. — **DONE 2026-08-06**
2. Set `NEXT_PUBLIC_APP_URL` in the deployed environment — tracking is disabled without it. **Currently set to the Vercel-assigned URL; see residuals.**
3. Run `docs/outreach-template-refresh.sql` (substitute `REPLACE_WITH_COMPANY_ID`). — **DONE 2026-08-06**
4. Pause sending, then `npm run requeue -- --apply`, then re-enable. — **DONE 2026-08-06** (see below)

### Out-of-band data repair (prod, applied this session)

- Paused sending (`active=false`, `pause_reason='manual'`), rewrote **149 unsent drafts** through the new rotation (0 failures, 0 LLM cost — all 149 were template-derived), then restored sending to its exact prior settings (daily cap 45, warmup anchor 2026-06-29, window 09:00–20:00, Gmail).
- The 61 queued sends were rewritten in place: new subject/body, fresh open + unsubscribe tokens, `scheduled_at` preserved. Post-repair audit of all 61: 0 carrying old copy, 61 ending on a question, 61 with both tokens, 61 unique tokens, subject spread across all five variants (recompete 20, bid/no bid 13, past performance 11, who writes 9, quick one 8).
- **Incident + fix.** The first `--apply` ran from `.env.local`, where `NEXT_PUBLIC_APP_URL=http://localhost:3001`, so all 61 queued bodies were written with a dead localhost unsubscribe link. Caught in post-apply verification before sending was re-enabled, so nothing went out with it. Repaired by rewriting only the URL prefix in place (token and copy untouched, verified per row that the link still ended in that row's own `unsub_token` and that body length changed by exactly the prefix delta). The script now **refuses to `--apply` when `NEXT_PUBLIC_APP_URL` is a localhost/loopback URL** — the unsubscribe link is baked into the stored body, so whatever the process sees becomes a permanent link in a real email.

### Residuals

- Link/tracking domain moved to `go.sourcegent.io` (GoDaddy CNAME → Vercel), so recipients see one domain in the signature and the links. The 44 queued sends had `signalgent.vercel.app` frozen into their stored bodies and were swapped in place. **`signalgent.vercel.app` must stay attached to the Vercel project**: 18 already-delivered emails point their unsubscribe links there permanently.
- Open tracking is inherently noisy: Apple Mail Privacy Protection prefetches images (false positives past the 15s guard) and Gmail proxies and caches them (repeat opens under-count). A single open is weak evidence; the aggregate across hundreds of sends is the signal.
- `open_count` is read-then-written, so simultaneous opens can lose a count. `opened_at` is set once and is the field decisions should rest on.
- Still no contact name anywhere in the pipeline — every email opens a bare "Hi,". That is a data problem (email → domain → company, no person), and it is likely the largest remaining drag on reply rate.
- The new templates omit the strongest differentiator in the old set: the "$10–15K per bid consultant vs $99/month" price anchor. Worth folding into a sixth variant or swapping into one of the five.
- No link-click tracking, only opens. Clicks are a stronger intent signal but need URL rewriting, which costs deliverability.
- `NEXT_PUBLIC_APP_URL` points at the Vercel-assigned domain, so every tracking pixel and unsubscribe link in a cold email resolves to `*.vercel.app`. That domain is heavily abused and widely filtered, and a link whose domain doesn't match the sending domain is itself a spam signal. Point it at a domain aligned with the sender (e.g. a subdomain of sourcegent.io) before volume ramps. Also confirm it is the stable production alias, not a per-deployment URL — deployment URLs rotate, and these links live in already-delivered mail forever.

---

## Session 29 — Outreach: templates skip review and auto-queue, personalized-first sending, sortable Ready to email, settings back-nav

Three user-reported friction points: Settings had no way back to the app; template drafts sat in a review queue even though their copy is pre-approved by definition; and the Ready to email list had a single fixed order. Plus a policy decision: personalized (custom-written) emails should always outrank templates in the send order.

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/send/queue.ts` (NEW) | Draft→send-queue core as a plain module (same server-action/cron split as `worker.ts`). `insertSendRows` moved here from `sending.ts` (tracking-column fallback intact). New `autoQueueDraftSend`: best-effort queue of a draft at the next drip slot — sending off, no sender, Gmail disconnected, prospect closed, or an existing active send are all silent skips that leave the draft `approved` in Ready to email for manual scheduling. Wrapped in try/catch so an auto-queue failure can never break enrichment. |
| `lib/integrations/outreach/enrich-run.ts` | Template drafts (fallback branch of `persistOutcome`, `backfillTemplateDrafts`) are inserted `approved` instead of `pending` — templates are pre-approved copy, so they skip "To review" entirely — and each is handed to `autoQueueDraftSend` immediately after upsert. |
| `lib/integrations/outreach/actions.ts` | Template follow-ups (`generateFollowup`, non-personalized branch) likewise insert as `approved` and auto-queue. Personalized follow-ups still insert `pending`. |
| `lib/integrations/outreach/sending.ts` | `scheduleDraftSends` now orders the batch personalized-first (non-empty `facts_for_draft`) before assigning `computeBatchSlots` slots — slots are handed out by array index, so this is what puts custom emails on the earliest send times. Select gains `facts_for_draft`. Both send-row inserts now go through the shared `insertSendRows`. |
| `lib/integrations/outreach/send/worker.ts` | `runQueue` fetches due sends at `BATCH * 3`, classifies them by the draft's `facts_for_draft` (sends carry no template marker column), stable-sorts personalized to the front, and caps at `BATCH`. When more than a tick's worth is due, personalized emails jump the template backlog; the template tail waits for the next tick. On a classification lookup failure it keeps plain `scheduled_at` order. |
| `components/widgets/content/outreach-widgets.tsx` | Sort bar (Type / Name / Email / Status, click to reverse) on the Ready to email, Sent, and All tabs. Default (`type` asc) renders the exact grouped Personalized→Templates sections as before, so nothing moves until you sort; other keys flatten the list. Status sorts by `send.status ?? draft.status` so queued rows group together. Empty-state copy for the Templates and Ready to email tabs now explains that templates auto-approve. |
| `app/(app)/settings/layout.tsx` | "← Back to Outreach" link above the Settings title. |
| `components/layout/topbar.tsx` | The Signalgent wordmark is now a `Link` to `/outreach`, so every page has a way home. |

### Verification

- `tsc --noEmit` clean; eslint reports the same pre-existing issues as `main`, nothing new.
- In-browser against the live app: back link navigates Settings → `/outreach`; wordmark carries `href="/outreach"`; Ready to email default view unchanged (grouped, 126 rows), Status sort flattens and groups approved-vs-queued correctly; no console errors.
- Send-priority and auto-queue paths verified by inspection only — exercising them against prod would queue real email.

### Behavior notes / residuals

- The 9 template drafts already sitting `pending` in the Templates tab predate this change and need one manual "Approve all"; nothing new will land in that tab, leaving it vestigial — candidate for removal in a later pass.
- Auto-queue places templates at the earliest open slot at creation time. A personalized draft approved later gets a later `scheduled_at`; its priority is enforced at the worker (it sends first among due emails) and within any batch it is scheduled in — the daily cap / drip pacing itself is unchanged.
- Templates now consume send capacity without a human in the loop: the cron's enrichment wave drafts them, approves them, and queues them. The Sending toggle is the kill switch — turning it off both stops the worker and makes `autoQueueDraftSend` a no-op.

---

## Session 30 — Outreach: bulk selection on the Scheduled calendar, "Select unqueued" on Ready to email

Two selection gaps reported after Session 29 went live: the Scheduled view had no way to select a whole day (e.g. grab everything on a Saturday and move it), and Ready to email's "Select all" grabbed queued and unqueued drafts alike, when the useful set for scheduling is only the unqueued ones.

### Changes

| File | Change |
| --- | --- |
| `components/widgets/content/scheduled-view.tsx` | Persistent **"Select all (N)"** button above the day-grouped list (previously the action bar only appeared once something was hand-picked). It operates on `visible`, so with a calendar day selected it means "select that whole day". Each sticky day header is now a `<label>` with a **checkbox that toggles every send on that day** in one click. New `toggleMany` helper; Reschedule…/Cancel appear once anything is selected, as before. |
| `components/widgets/content/outreach-widgets.tsx` | **"Select unqueued (N)"** button on the Ready to email tab, next to Select all. "Unqueued" mirrors what `scheduleDraftSends` would actually accept: no send row, or the latest attempt is `failed`/`canceled` (queued/sending/sent are skipped there as `alreadyQueued`). Hidden when every draft is already queued. |

### Verification

- `tsc --noEmit` clean; eslint findings identical to `main` (the two pre-existing `set-state-in-effect` errors, untouched code).
- In-browser against live data: "Select all (135)" renders on the Scheduled tab; one click on the "Friday, Aug 7 · 45" header checkbox selected all 45 sends and surfaced Reschedule…/Cancel (not confirmed — selection is client-side only, nothing mutated). "Select unqueued" correctly hidden with all 135 ready drafts queued.
- Incidentally confirmed Session 29 working on prod: Templates tab at 0, 135 auto-queued sends laid out at 45/day across Aug 7–9.

---

## Session 31 — Productization Phase 0: per-tenant offer profile (de-SourceGent the pipeline)

First build phase of the govcon productization plan (`docs/specs/signalgent-govcon-v1.md`, committed this session). The product being pitched was hardcoded across the drafting register, template library, and signatures, so the app could only ever sell SourceGent. Now every pitch surface reads from a per-company **offer profile**, with the SourceGent values as built-in defaults — so the existing tenant behaves identically until a profile row is saved, and a second tenant needs zero code changes.

### Changes

| File | Change |
| --- | --- |
| `supabase/migrations/20260807000000_outreach_offer_profile.sql` (NEW) | `outreach_offer_profiles`: company_id PK, product, site, sign_off, signature_name, user_count, pipeline, audience, pitch, artifacts (jsonb). Same RLS shape as outreach_templates. Remote-only/out-of-band as usual. |
| `lib/types/database.types.ts` | Hand-added Row/Insert/Update for the new table (types file is hand-maintained; migrations apply out-of-band). |
| `lib/integrations/outreach/offer-profile.ts` (NEW) | `OfferProfile` type, `DEFAULT_OFFER_PROFILE` (the former SENDER values + audience/pitch/artifacts previously baked into the register), `userCountMid(profile)`, and `loadOfferProfile(supabase, companyId)` — client-injected like `loadSettings`, treats a query error (table not yet migrated) as "no row", coalesces per-field to defaults. The profile can never be the reason enrichment or sending stops. |
| `lib/integrations/outreach/draft.ts` | `SYSTEM` → `systemFor(profile)`: audience, product, pitch, artifact list, social proof, site, and signature all interpolated. `draftEmail` gains a profile param (defaulted); `signatureIndex`/`stripReleaseValves`/`bodyWordCount`/`endsOnQuestion`/`reviewDraft` accept the profile's sign-off (regex-escaped) so cleanup respects a custom signature. One deliberate register change for the default tenant too: rule 3 now states "What it does: {pitch}" explicitly (previously implied by the artifact list alone). |
| `lib/integrations/outreach/template-library.ts` | `templateLibraryFor(profile)`; `TEMPLATE_LIBRARY` kept as the default-profile constant for client surfaces. Product/pitch/social proof interpolated; the five QUESTIONS stay proposal-domain by design — built-ins are the last-resort fallback and a tenant with a different offer authors user templates, which always win the rotation. Two follow-up lines lightly genericized (they previously named SourceGent mechanics verbatim). |
| `lib/integrations/outreach/template.ts` | `variantFor`/`buildTemplateDraft`/`buildTemplateFollowup` take a profile (defaulted); built-in signature renders from it. |
| `lib/integrations/outreach/send/compose.ts` | `composeEmail` gains a trailing optional profile; signature fallback + already-signed detection use it instead of the SENDER constant. |
| `lib/integrations/outreach/pipeline.ts` | `runPipeline`/`runPipelineFromName` thread an optional profile to `draftEmail`. |
| `lib/integrations/outreach/enrich-run.ts` | Batch runners load the profile once per batch and pass it through `runPipeline`, `persistOutcome`, `pickTemplateDraft`, and `backfillTemplateDrafts`. |
| `lib/integrations/outreach/actions.ts`, `sending.ts`, `send/queue.ts` | `generateFollowup`, `resolveManual`, `queueDraftSend`, `scheduleDraftSends`, and `autoQueueDraftSend` load and pass the profile. |
| `lib/integrations/outreach/offer-actions.ts` (NEW) | `getOfferProfile` / `saveOfferProfile` server actions. Save validates required fields + at least one artifact, upserts, and reports "migration hasn't been applied yet" specifically when the table is missing. |
| `app/(app)/settings/offer/page.tsx` (NEW) + `settings/layout.tsx` | Settings → Offer profile editor: product, site, sign-off/signature, audience, pitch, artifacts (one per line), social-proof phrases, each with guidance text. Nav item added. |

### Verification

- `tsc --noEmit` and eslint clean on all touched files (actions.ts keeps only its pre-existing unused-import warning).
- In-browser: Settings → Offer profile renders with the SourceGent defaults loaded through the fallback loader (table doesn't exist yet); Save correctly reports "The offer-profile migration hasn't been applied to the database yet." No console errors.
- Prompt-shape check: with `DEFAULT_OFFER_PROFILE` the rendered register matches the original except the added "What it does" sentence.

### Handoff

1. ~~Apply `supabase/migrations/20260807000000_outreach_offer_profile.sql`~~ — **DONE 2026-08-06**, verified live: Settings → Offer profile saves ("Saved. New drafts and sends use this profile."), so the SourceGent row now exists with the default values.

### Residuals / next in Phase 0

- Contact-name enrichment (emails still open "Hi,") — next chunk.
- The template editor's five starters still render from the DEFAULT profile on the client; they should read the tenant profile once a second tenant exists (small wiring, noted for the Phase 2 onboarding pass, which will generate starters from the profile anyway).
- Built-in follow-up copy changed slightly for the live tenant (two lines genericized); openers are unaffected in prod because SourceGent's active user templates win the rotation.

---

## Session 32 — Productization Phase 0: contact-name enrichment (no more bare "Hi,")

Second Phase 0 chunk. The pipeline only ever knew email → domain → company, never a person, so every email opened "Hi," — flagged in the Session 28 postmortem as likely the largest remaining drag on reply rate. Now a precision-tuned localpart parse (`bob.smith@acme.com` → "Bob Smith") supplies a greeting name, with an optional per-prospect manual override, and drafts are stored with the greeting baked in ("Hi Robert,") so the review queue shows exactly what sends.

### Design

- **Parse over storage**: the baseline is a pure function with no DB dependency, so it works before (and without) any migration. Only the manual override needs the new `contact_name` column, and every read of it is tolerant — a query error means "no overrides yet", never a stopped pipeline.
- **Precision over recall**: only separator-delimited shapes (`first.last`, `first_last`, `first-last`, optional middle token) with an alphabetic 2+-char first token that isn't one of ~100 role words (info, sales, front, desk, estimating, proposals…). Single-token localparts (`mike@`, `dvegroup@`), initial-first shapes (`j.smith@`), and glued names (`carlmckittrick@`) all return null — "Hi Meridian," reads worse than "Hi,".
- **Greeting baked at draft creation**: `applyGreeting` rewrites only a leading bare greeting line ("Hi," → "Hi Robert,"), is idempotent, and never touches an already-named greeting ("Hi Acme,").

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/contact-name.ts` (NEW) | `parseContactName`, `firstNameOf`, `resolveContactName` (stored override beats parse; blank falls back), `applyGreeting`, and the tolerant `fetchStoredContactNames`. Client-safe (type-only imports). |
| `supabase/migrations/20260808000000_outreach_contact_name.sql` (NEW) | `outreach_prospects.contact_name` (manual override; comment distinguishes it from `recipient_name`, the COMPANY). Remote-only as usual. |
| `lib/types/database.types.ts` | `contact_name` on prospects Row/Insert/Update. |
| `lib/integrations/outreach/enrich-run.ts` | Batch runners fetch stored overrides once per batch and pass resolved names into `persistOutcome`, which applies the greeting to both personalized and template drafts; `backfillTemplateDrafts` does the same. |
| `lib/integrations/outreach/actions.ts` | `generateFollowup` and `resolveManual` resolve + apply the name; new `setContactName` server action (empty clears the override) with a specific migration-pending error. Snapshot exposes `contact_name` (resolved) + `contact_name_manual` on the prospect view. |
| `components/widgets/content/outreach-widgets.tsx` | Contact editor in the draft detail header: the input holds only the manual override, a parsed name shows as the placeholder ("Robert Caviness (from email)") so clearing falls back to the parse, and a hint shows the exact greeting new drafts get. |

### Verification

- 22-case parse test + greeting behavior suite (idempotency, named-greeting no-op, null no-op, override precedence, blank-override fallback): ALL PASS. One real gap caught and fixed by the tests (`front.desk@` parsed as a person before 'front'/'desk' joined the role words).
- `tsc --noEmit` clean; eslint findings identical to `main`.
- In-browser: `carlmckittrick@` shows "no name — greets 'Hi,'"; `robert.caviness@aleutfederal.com` shows "Robert Caviness (from email)" + 'new drafts greet "Hi Robert,"'; Save before the migration reports the specific pending-migration error.

### Handoff

1. ~~Apply `supabase/migrations/20260808000000_outreach_contact_name.sql`~~ — **DONE 2026-08-06**.

### Out-of-band data pass (prod, applied 2026-08-06)

The 135 queued sends and their 135 unsent drafts predated the change and opened "Hi,". A one-off script (run and then deleted — deliberately NOT a requeue: bodies were never recomposed, so no tokens were minted and `NEXT_PUBLIC_APP_URL` was never involved, sidestepping the Session 28 localhost-link trap entirely) applied `applyGreeting` in place: **21 queued sends + their 21 drafts** rewritten ("Hi," → "Hi Darrin," etc.), the other 114 unparseable (role/glued localparts — the precision gate working as designed). Send updates guarded on `status='queued'`; subjects, schedules, tokens, signatures, footers untouched.

- **Bug caught in dry run:** the script's first version read ALL 4,933 prospects unpaginated — PostgREST's silent 1,000-row cap (the Session 26 bug) stranded 12 of 21 drafts as "prospect missing" while sends slipped through on their own `recipient_email` fallback. The 21-vs-9 asymmetry in the dry-run counts exposed it before anything was written; fixed by fetching only referenced prospect ids.
- **Post-apply audit:** re-run reports 0 remaining (idempotent); all 21 named bodies verified to keep their own `unsub_token` and a well-formed `Hi {First},` first line.

### Behavior notes

- Greetings bake in at draft creation, so everything from the next enrichment wave on is named automatically when the localpart parses; already-SENT emails are history and unchanged.

---

## Session 33 — Phase 0 acceptance test PASSED + company-form fixes it surfaced

**Phase 0 is closed.** Eudon ran the acceptance test on the dev server: created a second company ("ABC Corp."), configured it, and sent an email — a different tenant producing credible outreach with zero code changes, which was the phase's exit criterion. The test surfaced two bugs in the add-company flow, fixed here.

### Changes

| File | Change |
| --- | --- |
| `components/ui/select.tsx` | Select dropdowns portal at `z-50`, but the add-company modal overlay sits at `zIndex 100` — so the Industry dropdown opened BEHIND the popup. Bumped the Positioner + Popup to `z-[150]` (global: an open select should beat any overlay; nothing legitimately stacks above an open dropdown). |
| `lib/utils.ts` | `normalizeWebsiteUrl`: "www.url.com" / "acme.com/about" → prepend `https://`; existing schemes pass through; empty → null. |
| `components/layout/add-company-modal.tsx`, `app/onboarding/page.tsx` | Website inputs switch `type="url"` → `type="text"` + `inputMode="url"` — browser url validation rejects the bare domains people actually type — and both submit paths store the normalized URL. Placeholders now show a bare domain. |

### Verification

- In-browser: Industry dropdown now renders on top of the Add company modal, options clickable ("Healthcare" selected into the trigger); website field accepts bare domains with no validation block. Modal closed without creating data.
- `normalizeWebsiteUrl` unit cases (bare, www, path, both schemes, uppercase scheme, empty/whitespace): ALL PASS.
- `tsc --noEmit` + eslint clean.

---

## Session 34 — Phase 1 chunk 1: automatic follow-up sequences

The largest functional gap vs every competitor: follow-ups existed but were generated one prospect at a time by hand. Now the cron drafts and queues the next touch automatically when a sent email goes unanswered. Per-company settings for now; the campaigns table (next chunk) will carry per-campaign overrides with these as the fallback.

### The rule

For every prospect with **all touches sent**, **no reply** (disposition still open), **fewer than `followup_max_touches` total touches**, and the **last send ≥ `followup_wait_days` business days ago**: generate the next touch and queue it. Hard guards: threads older than ~45 days are left alone (a nudge on a months-old cold email reads as spam — also prevents enabling the toggle from blasting follow-ups at the entire 389-send history); at most 15 follow-ups per company per tick (bounds LLM cost); a rejected/pending/approved-but-unsent touch stalls the sequence (it's either mid-flight or parked on a human decision); replies, bounces, and opt-outs stop it cold (the sweep runs AFTER the reply scan in the cron, and disposition is re-checked at generation time).

### Auto-approval semantics

Template follow-ups are pre-approved copy → approved + queued (as since Session 29). Personalized follow-ups are LLM output: **clean ones (drift check passed) auto-approve and queue** — the opener's facts were already human-approved and the drift check re-verifies them — while a **drifted draft lands in "To review"** and pauses that prospect's sequence until a human decides. The manual "Generate follow-up" button keeps its old semantics (personalized always goes to review).

### Changes

| File | Change |
| --- | --- |
| `supabase/migrations/20260809000000_outreach_followups.sql` (NEW) | `followup_enabled` (default FALSE — enabling is an explicit choice), `followup_wait_days` (4), `followup_max_touches` (3) on outreach_settings. Remote-only as usual. |
| `lib/integrations/outreach/followups.ts` (NEW) | `generateFollowupTouch` — the touch generator moved out of actions.ts into a plain module (cron-callable), with the `auto` flag selecting sweep vs manual approval semantics. `runFollowupSweep` — the cron pass: paged reads of drafts + sent sends (1,000-row-cap safe), pure `selectFollowupCandidates` filter (unit-tested), capped generation loop. `businessDaysSince` (UTC weekdays). |
| `lib/integrations/outreach/actions.ts` | `generateFollowup` is now a thin auth wrapper over the shared core (−100 lines). |
| `app/api/outreach/cron/route.ts` | Sweep wired in after `scanReplies`; response reports `followupsQueued` / `followupsReview`. |
| `lib/integrations/outreach/send/worker.ts`, `types.ts`, `lib/types/database.types.ts` | New settings threaded through defaults + loader (`??` defaults pre-migration). |
| `lib/integrations/outreach/sending.ts` | `saveSendSettings` retries without the follow-up keys if their columns don't exist yet — this save is also the sending kill switch and must never be blocked by a pending migration. |
| `components/widgets/content/sending-settings-modal.tsx` | "Automatic follow-ups" section: toggle + wait (business days) + max touches, with the semantics spelled out in the hint text. |

### Verification

- Unit suite: `businessDaysSince` (Mon→Fri = 4, Fri→Mon = 1, same-day/reversed = 0) and `selectFollowupCandidates` (due / too-recent / at-max / in-flight / no-drafts / stale-thread / never-sent): ALL PASS.
- In-browser: the new section renders in Sending settings, toggle reveals the two fields with correct defaults; canceled without saving. No console errors.
- `tsc --noEmit` clean; eslint findings identical to `main`.

### Handoff

1. ~~Apply `supabase/migrations/20260809000000_outreach_followups.sql`~~ — **DONE 2026-08-06**. (Note: the PR itself was still open on GitHub when the next session started — merged then via API; main history shows it as merge `2e62abd`.)
2. To turn sequences on for SourceGent: Sending settings → check "Automatic follow-ups" → Save. First activation will follow up prospects whose last send is within the 45-day window, 15 per tick.

---

## Session 35 — Phase 1 chunk 2: campaigns

Until now every prospect lived in one global per-company pool — no way to run two efforts at once, compare results, or give one list different sequencing. A campaign is a named slice of the pool: prospects join at ingest, the whole workspace filters by campaign, and the follow-up sweep resolves its config per prospect (campaign override ?? company setting).

### Changes

| File | Change |
| --- | --- |
| `supabase/migrations/20260810000000_outreach_campaigns.sql` (NEW) | `outreach_campaigns` (name, active/archived, three nullable follow-up overrides; full RLS incl. delete) + `outreach_prospects.campaign_id` (FK, ON DELETE SET NULL — deleting a campaign returns prospects to the pool) + index. Remote-only as usual. |
| `lib/integrations/outreach/campaigns.ts` (NEW) | `OutreachCampaign` / `FollowupConfig` types, `resolveFollowupConfig` (campaign field ?? company field — an override can enable sequences even when the company toggle is off, and vice versa), tolerant `loadCampaigns` ([] pre-migration) and chunked `fetchProspectCampaignIds`. |
| `lib/integrations/outreach/campaign-actions.ts` (NEW) | `listCampaigns`, `createCampaign`, `updateCampaign` (rename / archive / overrides), `assignProspectsToCampaign` — all with specific migration-pending errors. |
| `lib/integrations/outreach/followups.ts` | Sweep resolves config per prospect: only possibly-due prospects get their campaign looked up; `selectFollowupCandidates` now takes a `configFor(prospectId)` callback. An **archived campaign always stops its sequences** — archiving IS the "this effort is over" signal. The sweep runs when follow-ups are enabled company-wide OR on any active campaign. |
| `lib/integrations/outreach/actions.ts` | `ingestProspects` gains an optional `campaignId` (with a strip-and-retry fallback pre-migration so adds are never blocked); the snapshot loads campaigns in the same `Promise.all` and exposes `campaign_id` per prospect. |
| `components/widgets/content/outreach-widgets.tsx` | Campaign selector next to the Outreach title: All campaigns / each active (with prospect count) / archived / No campaign / Manage campaigns…. The filter scopes every tab and list (metrics bar stays company-wide — queue, caps, and cost are company-level); new prospects join the selected campaign; switching filter clears selection state; filter resets on company switch. |
| `components/widgets/content/campaigns-modal.tsx` (NEW) | Create + per-campaign rows: inline rename (save on blur), Archive/Restore, and the three follow-up overrides (Inherit/On/Off select; blank number = inherit). |

### Verification

- Unit suite: `resolveFollowupConfig` (inherit-all, override-off-beats-company-on, override-on-beats-company-off, partial override, null campaign) + per-prospect `selectFollowupCandidates` (due vs campaign-disabled vs longer-wait campaign): ALL PASS.
- In-browser: selector renders ("All campaigns" + "Manage…" in the pre-migration state), Manage opens the modal, Create correctly reports "The campaigns migration hasn't been applied to the database yet." No console errors. `tsc` clean; eslint identical to `main`.

### Handoff (not applied)

1. Apply `supabase/migrations/20260810000000_outreach_campaigns.sql`. Until then: no campaigns exist, every read resolves to the campaign-less pool, ingest strips the campaign id, and create/update report the specific pending-migration error.

### Not in this chunk (per spec, later)

Per-campaign stats/detail page, per-campaign template sets and offer profiles, bulk "move selected prospects to campaign" UI (the `assignProspectsToCampaign` action exists, unwired), campaign scoping for the enrichment wave.

---

## Session 36 — Phase 1 chunk 3: per-campaign stats + move-to-campaign UI

Closes the two loose ends from chunk 2 (migration applied and verified live this session — table + `campaign_id` column confirmed by read-only probe before building).

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/actions.ts`, `types.ts` | Snapshot's sends select gains `opened_at`; `OutreachSendView.opened_at` exposed (first tracked open, noise-filtered server-side). |
| `components/widgets/content/outreach-widgets.tsx` | Per-campaign funnel derived client-side from the snapshot (`CampaignStats`: prospects / sent / opened / replied) — drives the selector's counts and the manage modal. ContactsTable gains a **Campaign column** (sortable, shown only when campaigns exist) and a **"Move to campaign…"** bulk action on the selection bar (active campaigns + "No campaign"), wiring the existing `assignProspectsToCampaign`. |
| `components/widgets/content/campaigns-modal.tsx` | Each campaign row now shows its funnel: `N prospects · S sent · O opened · R replied (rate%)`. Same open-tracking caveat as the company-wide rate: pre-tracking sends undercount opens. |

### Verification (live, ABC Corp tenant, post-migration)

- Created campaign "Pilot list" through the modal (real insert — the migration works), stats line rendered.
- Selected the tenant's one contact → "Move to campaign…" → Pilot list: Campaign column shows it, the workspace selector updated to "Pilot list (1)", and filtering by it scoped every tab correctly (Contacts 1 / Ready to email 1). "Pilot list" left in place as a working example.
- `tsc` clean; eslint identical to `main`; no console errors.

---

## Session 37 — Phase 2 chunk 1: deliverability preflight (SPF / DKIM / DMARC / MX / tracking domain)

First Phase 2 chunk. A stranger who connects a mailbox and starts sending without authentication lands in spam, blames the tool, and burns their domain doing it. These are plain DNS lookups (no third-party service, no API key) turned into pass / warn / fail verdicts, each with the fix spelled out.

### Design

- **Pure evaluators over raw records** (`evaluateSpf`, `evaluateDmarc`, `evaluateDkim`, `evaluateMx`, `evaluateTrackingDomain`) — unit-testable without touching DNS — with the I/O split out and mirroring `deliverability.ts`: short timeout, and any transient/unknown DNS error resolves to an `unknown` verdict rather than a red failure the user can't act on.
- **Checks**: SPF (missing / duplicate / `+all` / `?all` / no-`all` / >10 lookups / provider alignment), DKIM (12 common selectors on both the sending domain and its parent), DMARC (missing / `p=none` / enforced / missing `rua`), MX (replies need somewhere to land), and tracking-domain alignment — which finally surfaces the long-standing `*.vercel.app` residual as an in-app finding.
- **SPF provider alignment**: sending through Gmail while SPF authorizes only Amazon SES is a silent SPF failure on every message. Warn, not fail, since a relay can legitimately sit in between.

### Three false positives caught by testing against live DNS (each fixed)

1. **DMARC on subdomains.** `send.sourcegent.io` has no `_dmarc` record of its own, and the checker called that a hard fail — but RFC 7489 §6.6.3 says receivers fall back to the organizational domain, and `sourcegent.io` publishes `p=quarantine`. Now looks up the parent, honors `sp=` when present, and reports the inherited policy explicitly. A tool that cries wolf about DNS is worse than no tool.
2. **`redirect=` is authorization.** `gmail.com`'s own record is `v=spf1 redirect=_spf.google.com`; matching only `include:` reported it as unauthorized. Both forms now count.
3. **`redirect=` legitimately has no `all`.** RFC 7208 forbids the two coexisting, so the "no `all` mechanism" warning is wrong for redirect records and is now skipped there.

### Consumer sending domains

Live-checking the real SourceGent settings surfaced that its sender is **`thedvegroup@gmail.com`** — a consumer mailbox domain. SPF/DKIM/DMARC advice about `gmail.com` is unactionable (those are Google's records to publish), so the checker now detects consumer domains and replaces that noise with the finding that matters: the sending address itself, plus the fix (send from a domain you own). Tracking-domain alignment likewise drops the "align to gmail.com" advice while still flagging `*.vercel.app`.

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/dns-check.ts` (NEW) | Verdict types, pure evaluators, consumer-domain detection, and `checkSendingDomain` — every lookup concurrent and timeout-bounded, never throws. |
| `lib/integrations/outreach/dns-actions.ts` (NEW) | `checkDeliverability(companyId)` — read-only; derives the domain from the saved sender email and passes the configured provider for the alignment check. |
| `components/widgets/content/sending-settings-modal.tsx` | "Deliverability" panel: overall badge, Check now / Re-check, and a colour-coded row per finding with its fix. Read-only — it never mutates settings. |

### Verification

- 60+ assertions across every evaluator (including all three false-positive regressions and the consumer-domain path): ALL PASS.
- Live DNS against `sourcegent.io`, `send.sourcegent.io`, `google.com`, `gmail.com` — results match the raw records, confirmed by dumping the TXT records alongside.
- `tsc` clean. eslint: the file's two pre-existing `no-unescaped-entities` errors (warmup/bounce copy) are unchanged — verified identical on `main`.
- In-browser against the live SourceGent workspace: the panel renders in Sending settings, "Check now" runs against real DNS and returns the FAIL badge with the consumer-domain finding and the tracking-domain finding (correctly `localhost` in dev). The unactionable SPF/DKIM/DMARC rows are suppressed as designed. Closed via the backdrop, never Save, so live sending settings were untouched. No console errors.

### Findings for SourceGent's live setup (informational, no action taken)

1. Sending is configured from **`thedvegroup@gmail.com`**. Cold outreach from a consumer Gmail address can't be authenticated (no SPF/DKIM/DMARC you can publish) and is heavily filtered under Google/Yahoo bulk-sender rules — the single biggest deliverability lever available, and plausibly a contributor to the 0-reply run.
2. `NEXT_PUBLIC_APP_URL` still points at `*.vercel.app` (the standing residual), so tracking and unsubscribe links don't align with the sending domain.
3. `send.sourcegent.io` authorizes Amazon SES in SPF, not Google — relevant if sending ever moves to that domain over Gmail.

---

## Session 38 — Phase 2 chunk 2: setup checklist + warmup reset on mailbox change

A new user lands on a dense ten-tab workspace with no idea what order to do things in. This adds the six-step funnel that must be true before a first email can go out, shown at the top of the workspace until it's done.

### The checklist

Describe what you sell → Connect a mailbox → Set your sender details → Authenticate your domain → Add prospects → Turn on sending. Each incomplete step carries a one-line *why* (teach, don't just list) and a button to the surface that fixes it.

Design choices:
- **Non-blocking, not a modal wizard.** It's resumable, doubles as a health panel, and leaves the dense workspace available for people who know what they're doing.
- **Cheap.** No DNS on page load — a handful of indexed reads. The one deliverability signal it derives for free is `isConsumerDomain` (a pure string check); the full SPF/DKIM/DMARC preflight stays behind its button in Sending settings. The `auth` step therefore never blocks completion on its own.
- **Collapses when done** to a one-line summary (with the count of warnings worth a look), dismissible for the session. The user's expand/collapse choice overrides the default either way.

### Warmup reset on mailbox change (`sending.ts`)

`warmup_started_at` is per-company and was only ever set once. Switching to a different sending mailbox therefore inherited the old mailbox's fully-ramped cap — SourceGent's anchor is 2026-06-29, so a brand-new mailbox would have started at the full 45/day on day one, which is the fastest way to burn a fresh sender's reputation. Changing `sender_email` to a different address now re-anchors the ramp to now. Directly relevant to moving off the consumer Gmail address.

### Changes

| File | Change |
| --- | --- |
| `lib/integrations/outreach/setup-status.ts` (NEW) | `getSetupStatus(companyId)` → six typed steps with state / detail / why / action. |
| `components/widgets/content/setup-checklist.tsx` (NEW) | The panel: expanded while work remains, one-line summary once complete, per-step action buttons. |
| `components/widgets/content/outreach-widgets.tsx` | Renders the checklist above the pipeline banners; maps step actions to the right modal or route; recomputes on the same events as the snapshot. |
| `lib/integrations/outreach/sending.ts` | Warmup re-anchor when the sender mailbox changes. |

### Verification (live, both tenants)

- **SourceGent (fully configured)**: renders the collapsed "Setup complete — 1 thing worth a look" line; Review expands to all six steps with the consumer-mailbox warning on `Authenticate your domain`; its action button opens Sending settings. Closed via backdrop — settings never saved.
- **ABC Corp (partially configured)**: auto-expands to "Finish setting up outreach — 3 steps left", correctly marking dry-run mailbox and 1 prospect as done while flagging offer profile, sender details, and sending as todo.
- **Bug caught in browser**: the complete-state "Review" button did nothing — `open` initialised to `true` meant the collapsed branch rendered while the expand handler set a value it already held. Reworked to a tri-state (`null` = follow the default, boolean = user's explicit choice).
- `tsc` clean; eslint findings identical to `main`; no console errors.

---

## Session 39 — Phase 2 chunk 3: warmup ramp made visible + teach-first empty states

**Phase 2 is complete** with this chunk.

### The warmup ramp was invisible math

`effective_daily_cap` had been computed and carried on the snapshot since Session 23 — and displayed *nowhere*. The queue would go quiet mid-morning with nothing on screen explaining why, exactly the kind of silence that makes a new user assume the product is broken.

New **Today** metric: `sent_today / effective_daily_cap`, amber once the cap is hit, with a hint that adapts — `sending is off`, `resumes tomorrow`, `warmup day N → 45`, or `daily limit`. On the live SourceGent workspace it immediately read **45/45 · resumes tomorrow**, explaining a 369-email queue that isn't moving.

| File | Change |
| --- | --- |
| `lib/integrations/outreach/send/worker.ts` | Exported `todayBounds(settings, now)` (UTC instants bounding the timezone-local day the cap is measured over) and `warmupDayIndex(settings, now)` (1-based sending-weekday index, null once ramped or disabled). Both reuse the existing private tz helpers rather than duplicating the maths. |
| `lib/integrations/outreach/actions.ts`, `types.ts` | Snapshot's `sending` gains `daily_send_limit`, `sent_today` (counted over the same local day as the cap, so the ratio always reconciles), and `warmup_day`. |
| `components/widgets/content/outreach-widgets.tsx` | The Today tile, plus rewritten empty states. |

### Teach-first empty states

Every tab's empty message now says what the tab is *for* and what fills it ("Prospects appear here when the resolver finds a company but isn't confident enough to use it"), so a newcomer learns the pipeline by walking the tabs instead of guessing which of ten is broken. The no-prospects state explains the enrichment → draft → fact-check → approve flow in three lines and is campaign-aware.

### Verification

- 15-assertion unit suite on the new time helpers: ramp values across days 1/2/5, weekends not advancing the ramp, clamping at the configured limit, `warmupDayIndex` nulling when ramped or disabled, and `todayBounds` landing on local midnight (04:00Z under EDT), spanning exactly 24h, straddling local midnight correctly in both directions, and honoring a different timezone. ALL PASS.
- In-browser on the live workspace: Today reads 45/45 amber with `resumes tomorrow`; new empty-state copy renders. The hint was shortened after the first render ellipsized it inside the tile. No console errors.
- `tsc` clean; eslint identical to `main`.

### Phase 2 complete — design-partner readiness

Setup checklist, deliverability preflight, warmup visibility, and teach-first empty states are all in. Per the spec that closes Phase 2; next is **Phase 3, reply triage** (show the reply thread in-app with quick triage, deep-linking to Gmail to answer).

---

## Session 40 — Phase 3: reply triage

The scanner has detected replies since Session 23 and filed a neutral `replied` disposition — but that only ever moved a row into a list. This turns it into a worklist.

### The Replied tab is now an inbox

`ReplyInbox` replaces the generic two-pane list on that tab:
- **Needs triage first.** `replied` is what the scanner sets automatically; anything still in that state is awaiting a human decision, so it sorts above the triaged pile under its own accent header.
- **One-click classify** — Interested / Not interested / Opt out (which suppresses the address permanently), and Re-triage to send something back to the queue.
- **Deep link out.** Answering happens in Gmail; composing in-app stays out of scope for v1 per the spec.

### Gmail deep links

`gmailThreadUrl(threadId, senderEmail)` builds `mail.google.com/mail/u/<email>/#all/<thread>`. Using the address rather than `u/0` makes Gmail resolve the *right* account instead of whichever is signed in first — which matters the moment someone has a personal and a work account open. Falls back to `u/0` when no sender is configured. Threads reach the snapshot via a new prospect-level `thread_id` (follow-ups thread under the opener, so any send's thread id reaches the same conversation) and the link also appears in the draft detail's reply block.

### Bug found in live data: HTML entities in reply previews

Real bounce notices were rendering as `Your message wasn&#39;t delivered` — Gmail's API returns snippets HTML-escaped and we store them verbatim, so every preview since open-tracking shipped has shown raw entities. New `decodeEntities` decodes at *display*, which fixes the messages already captured rather than only future ones, and is idempotent. Deliberately not `innerHTML`-based: this is untrusted inbound content, and React escapes the result on render, so a decoded `<` stays text.

### Changes

| File | Change |
| --- | --- |
| `components/widgets/content/reply-inbox.tsx` (NEW) | The inbox, `gmailThreadUrl`, and `decodeEntities`. |
| `lib/integrations/outreach/actions.ts`, `types.ts` | Snapshot carries `thread_id` per prospect and `sender_email` on `sending`. |
| `components/widgets/content/outreach-widgets.tsx` | Replied tab routes to the inbox; draft detail gains the Gmail link and decodes preview text. |

### Verification

- 5 assertions on `gmailThreadUrl` (account form, `u/0` fallback, blank/whitespace sender, trimming, plus-addressed encoding) and 12 on `decodeEntities` (the real `&#39;` bug, named/hex/decimal forms, unknown entities and bare ampersands left alone, out-of-range codepoints, idempotence): ALL PASS.
- Live, read-only on SourceGent: the Gmail link renders on a real bounced thread with the correct href (`…/u/thedvegroup%40gmail.com/#all/19fa8f4af8c1698a`), and previews now read "wasn't delivered" instead of `wasn&#39;t`.
- Live on the ABC Corp test tenant: temporarily set its one prospect to `replied` with an entity-laden preview, confirmed the Needs-triage card, decoding, and that Interested moves it to Triaged with the pill — then **restored the row exactly** (disposition `open`, all reply fields null). Chose that tenant precisely because it has no queued sends, so a temporarily-suppressed prospect could not cause the worker to cancel anything.
- A console `decodeEntities is not defined` appeared from the HMR window between adding the call and adding the import; confirmed stale by re-exercising the path with no new error and correct decoded output. `tsc` clean; eslint identical to `main`.

### Not in this chunk (per spec)

Composing replies in-app, and a full unified inbox (message bodies live in Gmail; we hold previews only).
