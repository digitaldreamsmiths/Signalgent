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
