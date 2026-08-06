# Signalgent Outreach — Stage 1 Enrichment Build Spec

> Handoff doc. Written from the SourceGent repo after verifying every claim
> against the live USASpending API and the actual SourceGent code. Paste the
> "Prompt for the Signalgent session" block at the bottom into a fresh Claude
> Code session opened in the Signalgent repo.

## What this is

A govcon cold-outreach intelligence pipeline. Given a list of contact email
addresses, produce a tailored, facts-only outreach draft per company, gated by
a confidence score, queued for human approval. Sending is out of scope (routes
through a dedicated cold-email platform, not in-app).

SourceGent is client zero. The govcon research layer is the vertical-specific
part; the outreach pattern (ingest → enrich → synthesize → draft → gate →
queue) is the generic part that should live in Signalgent and stay reusable for
non-govcon users later.

## Four stages

1. **Domain extraction** — deterministic. Strip everything after `@`. No AI.
2. **Enrichment (Stage 1)** — pull govcon signals from USASpending. THIS DOC.
3. **Synthesis (Stage 2)** — pick the single best angle, score confidence,
   low-confidence routes to skip pile. Facts-only contract.
4. **Draft (Stage 3)** — write the email using only `facts_for_draft`. Register
   rules locked below.

## Stage 1 — verified design

### Data source: USASpending only. SAM.gov is NOT needed for v1.

Confirmed against the live public API (no key, no rate limit, no registration
wait). The socioeconomic flags that make the personalization land come from the
**recipient-detail endpoint**, not the award rows.

### The flow (two calls)

```
domain ("eaglecontractorsinc.net")
  → company-name guess ("Eagle Contractors Inc")        [NET-NEW: resolver]
  → POST /api/v2/search/spending_by_award/              [LIFT from SourceGent]
       filters.recipient_search_text: [name]
       returns: award footprint + recipient_id per row
  → GET /api/v2/recipient/<recipient_id>/               [NET-NEW: ~10 lines]
       returns: business_types, uei, verified address
  → facts_for_draft[]
```

### Call 1 — spending_by_award (recipient-based)

Lift the query/aggregation shape from SourceGent's
`src/lib/rfp/contractor-xray.ts` (`fetchContractorProfile`,
`aggregateContractorProfile`, `mapAwardRow`). It already does recipient-name →
award footprint with fuzzy-match self-correction. Two changes when porting:

- **Add `recipient_id` to the requested `fields`** (it is not in the current
  list). You need it for call 2.
- Optionally wrap in the circuit-breaker client from
  `src/lib/market-check/clients/usaspending.ts` (`fetchWithCircuitBreaker` +
  `base.ts`) instead of `fetchWithRetry`. Note these are TWO separate code paths
  in SourceGent: contractor-xray has the recipient query but no breaker;
  market-check has the breaker but only NAICS queries. Stitch them.

Use award `Award Amount` values for the size/footprint signal.

### Call 2 — recipient/<id>/ (socioeconomic flags) — NET-NEW

`business_types` is the reliable socioeconomic source. Live example (Eagle
Contractors, real data):

```
business_types: [
  service_disabled_veteran_owned_business,
  small_business,
  veteran_owned_business,
  corporate_entity_not_tax_exempt,
  us_owned_business
]
uei: GJUEJJAHNH81
location: 6965 Corporate Circle, Indianapolis, IN 46278   (CAN-SPAM corroboration)
```

### Two verified gotchas — do not skip

1. **Award-level `Type of Set Aside` is unreliable.** It is an accepted field
   but returned `null` on all of Eagle's awards (so did agency/NAICS in that
   call — the contract-summary view is sparse). Build the socioeconomic signal
   from recipient-level `business_types`, NOT award rows.
2. **`total_transaction_amount` on the recipient endpoint can be negative**
   (Eagle: `-1,621,943.99`, net of de-obligations). It is NOT revenue. Use it
   for nothing. Size signal comes from `spending_by_award` award amounts only.
   Two fields, two purposes, don't cross them.

### The one genuinely new hard piece: domain → company name

None of the SourceGent callers do this (they all start from a known name or
NAICS). But it is smaller than it looks: resolution only needs to produce a
clean *company name string*, not a UEI — the existing `spending_by_award` query
takes fuzzy text and self-corrects with a substring filter on `Recipient Name`.
A bad/low-confidence match routes to the skip pile (it must not draft on a
wrong entity). Strategy: derive a name candidate from the domain, query, and
verify the returned recipient against location/NAICS before trusting it.

## Appendix: exact porting reference (verified against SourceGent code)

The two SourceGent clients use DIFFERENT fetch helpers with DIFFERENT return
contracts. This trips up the port if you don't know it going in.

### contractor-xray.ts — what to lift, and the one rewire

`fetchContractorProfile(recipientName: string, naicsCode: string | null)` in
`src/lib/rfp/contractor-xray.ts`. It uses `fetchWithRetry` (returns a raw
`Response`, throws on total failure) and does its own `res.ok` / `res.json()` /
recipient substring-filter inside a try/catch that returns a
`ContractorXrayResult`. Its own in-memory Map cache: 7-day TTL, 200-entry cap.

Request payload to copy (note: `Start Date`, NOT market-check's
`Period of Performance Start Date`):

```
filters: {
  recipient_search_text: [name],
  award_type_codes: ['A','B','C','D'],
  time_period: [{ start_date: <today-5y>, end_date: <today> }],
  naics_codes: [naicsCode]            // only when naicsCode present
}
fields: ['Award ID','Description','Award Amount','Awarding Agency Name',
         'Start Date','NAICS Code','Recipient Name',
         'recipient_id']             // <-- ADD THIS. not in the original list.
sort: 'Award Amount', order: 'desc', limit: 100, page: 1
```

`recipient_id` is returned at the TOP LEVEL of each result row (verified live:
`"recipient_id": "b353ee06-...-C"`). It is the value you pass to call 2.

### If you swap fetchWithRetry → fetchWithCircuitBreaker (recommended)

`fetchWithCircuitBreaker<T>(url, init, opts)` in
`src/lib/market-check/clients/base.ts` does NOT return a `Response` — it returns
`FetchResult<T> = { data: T, source: 'live', durationMs } | { data: null,
source: 'failed', error, durationMs }`. It parses JSON itself and never throws.
Defaults: timeoutMs 10000, retries 2 (3 attempts total), backoff 1s→2s→4s.

So the two lines in contractor-xray that touch the Response change:
- `if (!res.ok) return {...api_error}` → `if (result.source === 'failed') return {...api_error}`
- `const data = await res.json()` → `const data = result.data` (already parsed)

Everything else (the recipient substring filter, `mapAwardRow`,
`aggregateContractorProfile`) ports unchanged. Don't touch those — they're the
valuable deterministic core.

### Call 2 — recipient detail

`GET https://api.usaspending.gov/api/v2/recipient/<recipient_id>/` (use the
`-C` child-level id from call 1; verified to return `business_types`). Read
`business_types[]` for socioeconomic flags and `uei` + `location` for
corroboration. Wrap in the same `fetchWithCircuitBreaker` for consistency.

### Reliability caveat to encode, not assume

In the live Eagle run, `Awarding Agency Name` and `NAICS Code` came back `null`
on the award rows (the contract-summary view is sparse for some recipients). So
the agency/NAICS rollups from `aggregateContractorProfile` may be thin or empty
per company. Treat them as a nice-to-have signal; do NOT let Stage 2 synthesis
hard-depend on agency rollup being populated. The dependable signals are: award
amounts (footprint/size) + `business_types` (socioeconomic) + location.

## Stages 2 & 3 — locked register rules (from live testing)

### Stage 2 (synthesis) contract
- Output `facts_for_draft[]`; the draft model may use NOTHING else.
- Find the bridge between ONE procurement signal and ONE proposal pain point.
- Score confidence; low-confidence → skip, never fake personalization.
- Caveat honestly (e.g. low-bid IFBs have no proposal to write → weak fit).

### Stage 3 (draft) register

> **Superseded.** The register below was the original, and it was wrong. A
> 344-send run on it returned zero replies. The live rules are the `SYSTEM`
> prompt in `lib/integrations/outreach/draft.ts`; treat that file as the source
> of truth, not this block. Kept here because the reasons it failed are the
> reasons the current rules exist.

```
Register: genuine interest in the company + light sell of the idea.
- Open with ONE specific, earned observation about this company. No flattery.
- Name SourceGent exactly once, framed as a live tool in active use
  ("the contractors using it", "how other firms use it"). NEVER "building",
  "launching", "working on", or anything pre-launch. User base = social proof
  in passing, never a boast.
- One sentence on the core idea, one short line on the promise (they keep
  control, the load drops). Stop there.
- No free-labor offers. No "problem -> solution -> demo" skeleton.
- CTA soft and conditioned on their interest ("if X is on your mind...").
  No generic "15 minutes".
- Close warm and non-transactional. Good wishes either way.
- Site link lives in the signature. The body never sells hard.
- No em dashes.
```

What it got wrong, and what replaced it:

| Original rule | Why it cost replies | Now |
|---|---|---|
| "Close warm. Good wishes either way." | A closing good wish is a permission slip to ignore the email. | The body ENDS on one closed question. Nothing follows it. `stripReleaseValves` deletes the pleasantry if the model writes one anyway. |
| "CTA soft and conditioned on their interest" | Asks the reader to self-diagnose, then opt into something vague. Not answerable. | The CTA *is* the question, answerable in one line by someone who has never heard of you. |
| "one short line on the promise (the load drops)" | Abstract benefit language. Nothing to picture. | Must name a concrete artifact: compliance matrix, shred, Section L, past performance write-up. "proposal load", "busywork", "heavy lifting" are banned. |
| (subject unspecified) | 344 emails went out with inconsistent, unattributable subjects, mostly benefit claims that read as marketing. | 2 to 5 words, lowercase, a topic or question, never a benefit claim, never the company name. |
| (no length limit) | Bodies ran past 150 words. | 90 words for an opener, 60 for a nudge, enforced with one re-ask. |

The same rules are machine-checked by `replyRiskWarnings` in
`lib/integrations/outreach/hygiene.ts`, which runs against user-authored
templates in the editor and against every draft in the review queue.
- Echo `facts_used` on the draft so anything that drifted from
  `facts_for_draft` can be auto-rejected. One hallucinated award kills the email
  with a capture lead who knows their own history.

## Reusable vs net-new (Signalgent)

| Piece | State |
|---|---|
| App shell, auth, multi-company, theming, widget UI | reusable (built) |
| `connected_accounts` OAuth token store (gmail/outlook enum) | reusable (built) |
| AI-call pattern (intelligence layer) | reusable — Stage 2/3 ride it |
| Recipient → award footprint query + aggregation | LIFT from SourceGent contractor-xray |
| Circuit-breaker/cache resilience | LIFT from SourceGent market-check (different file) |
| recipient/<id>/ call for business_types | NET-NEW, ~10 lines |
| domain → company-name resolver | NET-NEW, the real new work |
| prospects/targets table + list ingestion | NET-NEW (small) |
| drafts table + review-queue actions (approve/edit/reject) | NET-NEW (small) |
| send path | OUT OF SCOPE — dedicated cold-email platform |

Architecture call: COPY the SourceGent USASpending code into Signalgent for v1
(self-contained, fast, low-risk). Extract a shared internal package later as
cleanup if both products keep leaning on USASpending. Not a v1 blocker.

## First move

Validate draft QUALITY on ~10 real govcon targets before building Signalgent
scaffolding. A polished pipeline around mediocre drafts is wasted. The Eagle run
already validated the chain logic end-to-end on real data.
