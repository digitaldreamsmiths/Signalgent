# Signalgent → sellable product: govcon vertical, v1 plan

*Drafted 2026-08-06 (Session 30). Strategy decided with Eudon: sell the vertical
first — "AI outreach for selling to government contractors" — keeping the
USASpending pipeline as the moat. Generic/pluggable signal sources are
deliberately deferred; the architecture work in Phase 0 keeps that door open.*

## Positioning

An AI SDR for companies whose customers ARE federal contractors: proposal
software (SourceGent is customer #1 and the case study), DCAA/govcon
accountants, capture and pricing consultants, ISO/CMMC compliance shops,
bonding/insurance agents, govcon staffing — plus contractors doing teaming and
subcontractor outreach.

Why this beats going generic first:
- The resolve→synthesize→draft pipeline grounded in **USASpending award data** is
  something no volume sender (Instantly/Smartlead/Lemlist) or generic AI SDR
  (Artisan/AiSDR) has. In a niche, that's the whole pitch; in the generic
  market it's one feature among fifty we don't have.
- Niche pricing power: AI SDRs charge $500+/mo; govcon data tools (GovWin et
  al.) far more. Target $99–299/mo — under an SDR hour, over commodity senders.
- The defaults we just shipped are the right story: **templates send themselves,
  personalized drafts never send without human approval.** "AI that can't
  hallucinate at your prospects" (facts verified, drift detection) is a real
  differentiator against AI SDRs.

**Prerequisite that is not code:** the case study needs results. 389 sends /
0 replies doesn't sell. Getting SourceGent's own motion to produce replies
(new template rotation + contact-name enrichment, below) is part of v1, not an
afterthought.

## Phase 0 — De-SourceGent the pipeline (tenant "offer profile")

The single biggest engineering item. Today the product being pitched is
hardcoded across:
- `lib/integrations/outreach/sender.ts` — SENDER identity, social proof
  (~20 contractors, >$4M pipeline)
- `lib/integrations/outreach/draft.ts` — the Stage 3 register (artifacts it may
  name: compliance matrix, shreds, Section L; the angle logic)
- `lib/integrations/outreach/template-library.ts` — five built-in variants, all
  SourceGent asks
- `lib/integrations/outreach/template.ts` — greeting/signature rendering

Build: an **offer profile** per company (new table `outreach_offer_profiles` or
columns on `outreach_settings`): what you sell, 2–4 proof points, concrete
artifacts to name, banned claims, CTA style, sender identity. The register and
synthesis prompts interpolate the profile; the template library becomes seeded
starter templates generated from the profile (editable, as today). USASpending
angle config (which award facts matter: agency mix, NAICS, set-asides, recency,
award size) lives on the profile too.

Acceptance test: create a second company with a different offer profile and get
credible drafts with zero code changes.

Also in Phase 0 (small but blocking): contact-name enrichment. Every email
still opens "Hi," — a data gap (email → domain → company, no person). Cheapest
viable: parse names from email localparts (bob.smith@ → Bob) with a
low-confidence gate, plus an optional per-prospect name column on CSV import.

## Phase 1 — Campaigns + automatic sequences

- `outreach_campaigns` table: name, offer profile, template set, schedule/caps,
  status. `campaign_id` on prospects; all workspace tabs scoped by campaign
  (an "All" view preserves today's behavior). Migration is remote-only/out-of-band
  as usual.
- **Auto follow-ups** — the largest functional gap vs every competitor. Per
  campaign rule: touch 2 after N business days without reply, touch 3 after M,
  max K touches, always stopped by disposition != open (suppression already
  works). Cron: find sent touches past the window with no later touch →
  `generateFollowup` → auto-queue. The pieces exist: steps/touches, Gmail
  threading (worker threads on prior message-id), deterministic template
  variant pairing, personalized follow-ups reusing stored synthesis (near-zero
  LLM cost). This phase is orchestration + one table.
- Per-campaign stats: sent/opens/replies by step and by template (extend the
  existing per-template stats).

## Phase 2 — Onboarding + deliverability guardrails

A stranger must succeed unassisted:
- Setup wizard: workspace → connect Gmail → offer profile (this doubles as the
  "aha": show a generated draft immediately) → **SPF/DKIM/DMARC checks** (plain
  DNS lookups, pass/fail with fix instructions) → import leads → approve starter
  templates → enable sending.
- Surface the warmup ramp that already exists (today it's invisible math).
- Per-campaign preflight checklist (DNS pass, warmup state, unsubscribe line,
  physical address set).
- Teach-first empty states; keep the dense workspace for power users.

## Phase 3 — Reply triage in-app (unified inbox lite)

Reply scanning + preview storage already exist. Show the reply thread on the
prospect detail, quick triage actions (interested / not / snooze), and a
deep-link to the Gmail thread to answer. In-app sending of replies is
explicitly deferred.

## Phase 4 — Billing, limits, teams-lite

- Stripe subscriptions (monthly plans + trial). Trial = `dry_run` provider plus
  a small real-send cap.
- Metering rides on what exists: `api_usage` already tracks per-company LLM
  cost; add per-plan caps on sends/day and enrichments/month.
- Roles can stay minimal (owner + member) — `requireCompanyAccess` already
  scopes by workspace membership.

## Phase 5 — IA restructure + brand + site

- Sidebar IA: Dashboard / Campaigns / Contacts / Inbox / Analytics / Settings.
  A campaign detail page hosts today's tab workflow; metrics bar becomes the
  dashboard. The two-pane review workspace survives intact — it's a selling
  point.
- Naming: needs its own brand (distinct from SourceGent; "Signalgent" was an
  internal codename for a six-mode app that no longer exists).
- Marketing site + pricing page + 3-min demo video.

## Parallel track — external gates (start early, they're slow)

- **Google OAuth verification + CASA audit** for gmail scopes. Weeks of
  process. Until passed, unverified apps cap at 100 users with a warning
  screen — acceptable for design partners, start the paperwork during Phase 1–2.
- Terms, privacy policy, DPA. CAN-SPAM is already handled in-product;
  suppression-list import is a small add for customers with existing opt-outs.

## Parallel track — scale debt

- `getOutreachSnapshot` ships every prospect to the browser (fine at 5K for one
  user; not for customers). Server-side pagination/filtering before design
  partners with big lists.
- Per-tenant rate limiting on USASpending + Anthropic calls once tenants > ~10.

## Explicitly NOT in v1

Multi-inbox rotation, warmup pools, Outlook sending, generic signal sources,
in-app reply composing, A/B beyond template stats, contact database/sourcing.

## Rough sizing (working sessions, our usual cadence)

| Phase | Sessions |
| --- | --- |
| 0 — offer profile + name enrichment | 3–4 |
| 1 — campaigns + auto sequences | 3–4 |
| 2 — onboarding + DNS checks | 2–3 |
| 3 — reply triage | 2 |
| 4 — billing + limits | 2–3 |
| 5 — IA/brand/site | 3–4 |

Design-partner ready after Phase 2 (≈ 8–11 sessions); publicly sellable after
Phase 4–5 plus Google verification.

## First 90 days, go-to-market

1. Run SourceGent's own outreach until it produces replies (that's the proof).
2. Recruit 5–10 design partners from adjacent govcon service providers at a
   founding-customer price; their offer profiles are the Phase 0 test cases.
3. Publish the case study with real numbers off the built-in analytics.
