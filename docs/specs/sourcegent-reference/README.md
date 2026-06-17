# SourceGent reference source (port-and-adapt, do NOT import)

These four files are copied verbatim from the SourceGent repo as porting
reference for Stage 1 of the outreach pipeline. They are NOT part of this repo's
build — do not `import` them. Read them, then author adapted equivalents under
`lib/integrations/usaspending/` matching Signalgent's conventions.

| File | What it is | Use for |
|---|---|---|
| `contractor-xray.ts` | THE core. Recipient-name → award footprint. `fetchContractorProfile`, `aggregateContractorProfile`, `mapAwardRow`, the fuzzy substring self-correction. | Port call 1. Add `recipient_id` to the `fields` list. |
| `market-check-base.ts` | The circuit breaker. `fetchWithCircuitBreaker<T>` → `FetchResult<T>` (`source: 'live'\|'failed'`, never throws, parses JSON). | The resilience layer to wrap both calls in. |
| `market-check-usaspending.ts` | NAICS-based query + NAICS/agency resolvers + `validateNaicsViaUsaSpending`. NOT the recipient query, but the cleanest example of the circuit-breaker call shape and request-body builder. | Reference for wiring contractor-xray's query through `fetchWithCircuitBreaker`. |
| `fetchWithRetry.ts` | The helper contractor-xray currently uses (returns raw `Response`, throws on total failure). | Context only — you're replacing it with the circuit breaker per the spec appendix. |

The exact field list, the two-line rewire to swap `fetchWithRetry` →
`fetchWithCircuitBreaker`, and the reliability caveats are all in
`../signalgent-outreach-stage1.md` → "Appendix: exact porting reference".
Verified live against the Eagle Contractors fixture (recipient_id
`b353ee06-990a-082f-c65b-647fc890a5de-C`).
