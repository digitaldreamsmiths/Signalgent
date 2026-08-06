-- Open tracking + one-click unsubscribe tokens.
--
-- Why: 344 emails went out with zero replies and no way to tell a copy problem
-- from a spam-placement problem, because nothing recorded whether anything was
-- ever opened. A 0% open rate and a 40% open rate call for opposite fixes.
--
-- Two independent per-send tokens rather than one. The open token travels in a
-- pixel URL that every mail client, proxy, and scanner fetches, so it leaks
-- freely; the unsubscribe token must not be guessable from it, or a pixel
-- prefetch could suppress a live prospect.
--
-- Both are nullable: the ~400 rows already in this table predate tracking and
-- must stay valid. Tokens are generated in app code at queue time (the body has
-- to embed them before the row exists), so there is deliberately no default.

alter table public.outreach_sends
  add column open_token uuid,
  add column unsub_token uuid,
  -- first open; kept separate from last_opened_at so "did this ever land" and
  -- "are they still reading it" stay answerable independently.
  add column opened_at timestamptz,
  add column last_opened_at timestamptz,
  add column open_count integer not null default 0,
  -- set when the recipient uses List-Unsubscribe / the footer link, as opposed
  -- to replying with opt-out intent (which scan.ts records on the prospect).
  add column unsubscribed_at timestamptz;

-- Unique so a token lookup can use maybeSingle(); partial so the historical
-- null rows don't collide with each other.
create unique index outreach_sends_open_token_idx
  on public.outreach_sends (open_token) where open_token is not null;
create unique index outreach_sends_unsub_token_idx
  on public.outreach_sends (unsub_token) where unsub_token is not null;

-- Open-rate reads filter to sent rows and group by company.
create index outreach_sends_company_opened_idx
  on public.outreach_sends (company_id, opened_at);

-- No RLS policy changes: the tracking endpoints are unauthenticated by
-- necessity (the recipient is not a user), so they run with the service role
-- and look rows up by token. The existing workspace-scoped policies keep
-- ordinary reads unchanged.
